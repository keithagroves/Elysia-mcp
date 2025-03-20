// Types for Enact Protocol
interface EnactCapability {
    enact: string;
    id: string;
    description: string;
    version: string;
    type: 'atomic' | 'composite';
    authors: { name: string }[];
    inputs?: EnactParameter[];
    tasks: EnactTask[];
    flow: EnactFlow;
    outputs?: EnactParameter[];
    env?: {
      vars?: EnactEnvironmentVariable[];
      resources?: {
        memory?: string;
        timeout?: string;
      };
    };
  }
  
  interface EnactParameter {
    name: string;
    description: string;
    required?: boolean;
    schema: EnactSchema;
  }
  
  interface EnactSchema {
    type: string;
    format?: string;
    default?: any;
    enum?: any[];
    items?: EnactSchema;
    properties?: Record<string, EnactSchema>;
    minimum?: number;
    maximum?: number;
    pattern?: string;
  }
  
  interface EnactEnvironmentVariable {
    name: string;
    description: string;
    required: boolean;
    schema?: EnactSchema;
  }
  
  interface EnactTask {
    id: string;
    type: string;
    language?: string;
    code?: string;
    dependencies?: {
      version?: string;
      packages?: {
        name: string;
        version?: string;
      }[];
    };
  }
  
  interface EnactFlow {
    steps: {
      task: string;
    }[];
  }
  
  interface ExecutionResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: {
      message: string;
      code: string;
      details?: any;
    };
    metadata: {
      capabilityId: string;
      version: string;
      executedAt: string;
      environment: string;
    };
  }
  
  // Abstract provider interface
  abstract class ExecutionProvider {
    abstract setup(task: EnactTask, dependencies?: any): Promise<boolean>;
    abstract executeCode(task: EnactTask, inputs: Record<string, any>, environment: ExecutionEnvironment): Promise<any>;
    abstract cleanup(): Promise<boolean>;
    abstract resolveEnvironmentVariables(requiredVars: EnactEnvironmentVariable[]): Promise<Record<string, any>>;
  }
  
  interface ExecutionEnvironment {
    variables: Record<string, any>;
    resources?: Record<string, any>;
  }
  
  // Configuration management
  class EnactConfig {
    private static instance: EnactConfig;
    private config: Record<string, any>;
  
    private constructor() {
      this.config = {
        executionEnvironment: 'local',
        environmentOptions: {},
        capabilityRegistry: 'local',
        registryOptions: {},
        logLevel: 'info',
        defaultTimeout: 300000, // 5 minutes in ms
      };
      
      this.loadFromEnvironment();
    }
  
    static getInstance(): EnactConfig {
      if (!EnactConfig.instance) {
        EnactConfig.instance = new EnactConfig();
      }
      return EnactConfig.instance;
    }
  
    loadFromEnvironment(): void {
      // Basic configuration
      if (process.env.ENACT_ENV_TYPE) {
        this.config.executionEnvironment = process.env.ENACT_ENV_TYPE;
      }
      
      // Docker-specific options
      if (this.config.executionEnvironment === 'docker') {
        this.config.environmentOptions = {
          dockerPath: process.env.ENACT_ENV_DOCKER_PATH || 'docker',
          networkMode: process.env.ENACT_ENV_DOCKER_NETWORK || 'bridge',
          memory: process.env.ENACT_ENV_DOCKER_MEMORY || '512m',
          cpus: process.env.ENACT_ENV_DOCKER_CPUS || '1.0'
        };
      }
      
      // Windmill-specific options
      if (this.config.executionEnvironment === 'windmill') {
        this.config.environmentOptions = {
          apiUrl: process.env.ENACT_ENV_WINDMILL_API_URL || 'https://app.windmill.dev/api/v1',
          workspace: process.env.ENACT_ENV_WINDMILL_WORKSPACE || 'default',
          token: process.env.ENACT_ENV_WINDMILL_TOKEN
        };
      }
      
      // Other global settings
      if (process.env.ENACT_LOG_LEVEL) {
        this.config.logLevel = process.env.ENACT_LOG_LEVEL;
      }
      
      if (process.env.ENACT_DEFAULT_TIMEOUT) {
        this.config.defaultTimeout = parseInt(process.env.ENACT_DEFAULT_TIMEOUT, 10);
      }
    }
  
    loadFromFile(filePath: string): void {
      try {
        // In a real implementation, you would read and parse the file
        const fileConfig = require(filePath);
        this.config = { ...this.config, ...fileConfig };
        console.log(`Loaded Enact configuration from ${filePath}`);
      } catch (error) {
        console.error(`Failed to load configuration from ${filePath}:`, (error as Error).message);
      }
    }
  
    set(key: string, value: any): void {
      if (key.includes('.')) {
        const [section, option] = key.split('.');
        if (!this.config[section]) {
          this.config[section] = {};
        }
        this.config[section][option] = value;
      } else {
        this.config[key] = value;
      }
    }
  
    get<T>(key: string, defaultValue?: T): T {
      if (key.includes('.')) {
        const [section, option] = key.split('.');
        if (this.config[section] && this.config[section][option] !== undefined) {
          return this.config[section][option] as T;
        }
      } else if (this.config[key] !== undefined) {
        return this.config[key] as T;
      }
      return defaultValue as T;
    }
  
    getAll(): Record<string, any> {
      return { ...this.config };
    }
  }
  
  // Local execution provider
  class LocalExecutionProvider extends ExecutionProvider {
    async setup(task: EnactTask): Promise<boolean> {
      console.log(`Setting up local execution for ${task.language} task`);
      return true;
    }
    
    async executeCode(task: EnactTask, inputs: Record<string, any>, environment: ExecutionEnvironment): Promise<any> {
      const { language, code } = task;
      
      if (!code) {
        throw new Error('Task code is required');
      }
      
      if (language?.toLowerCase() === 'javascript' || language?.toLowerCase() === 'typescript') {
        try {
          // Create a safe execution context
          const output: Record<string, any> = {};
          
          // Use Function constructor to execute the code
          const executeFn = new Function(
            'inputs', 
            'env', 
            'output',
            `
            try {
              ${code}
              return { success: true, output };
            } catch (error) {
              return { 
                success: false, 
                error: { message: error.message, stack: error.stack } 
              };
            }
            `
          );
          
          const result = executeFn(inputs, environment.variables, output);
          
          if ((result as any).success === false) {
            throw new Error(`Execution failed: ${(result as any).error.message}`);
          }
          
          return output;
        } catch (error) {
          throw new Error(`Script execution error: ${(error as Error).message}`);
        }
      }
      
      throw new Error(`Language ${language} not supported by local execution provider`);
    }
    
    async cleanup(): Promise<boolean> {
      return true;
    }
    
    async resolveEnvironmentVariables(requiredVars: EnactEnvironmentVariable[]): Promise<Record<string, any>> {
      const resolved: Record<string, any> = {};
      
      for (const envVar of requiredVars) {
        const { name, required, schema } = envVar;
        
        let value: any;
        
        if (process.platform === 'win32') {
          // Windows is case-insensitive for env vars
          const envKeys = Object.keys(process.env);
          const matchKey = envKeys.find(key => key.toLowerCase() === name.toLowerCase());
          value = matchKey ? process.env[matchKey] : undefined;
        } else {
          // Unix/Mac is case-sensitive
          value = process.env[name];
        }
        
        if (value === undefined && schema?.default !== undefined) {
          value = schema.default;
        }
        
        if (required && value === undefined) {
          throw new Error(`Missing required environment variable: ${name}`);
        }
        
        if (value !== undefined) {
          resolved[name] = value;
        }
      }
      
      return resolved;
    }
  }
  
  // Docker execution provider
  class DockerExecutionProvider extends ExecutionProvider {
    private options: {
      dockerPath: string;
      networkMode: string;
      memory: string;
      cpus: string;
    };
    private containerId: string | null = null;
    
    constructor(options: Record<string, any> = {}) {
      super();
      this.options = {
        dockerPath: options.dockerPath || 'docker',
        networkMode: options.networkMode || 'bridge',
        memory: options.memory || '512m',
        cpus: options.cpus || '1.0'
      };
    }
    
    async setup(task: EnactTask, dependencies?: any): Promise<boolean> {
      console.log(`Setting up Docker execution for ${task.language} task`);
      
      // Implementation would create a Docker container
      // This is a placeholder for demonstration
      this.containerId = `enact-container-${Date.now()}`;
      
      return true;
    }
    
    async executeCode(task: EnactTask, inputs: Record<string, any>, environment: ExecutionEnvironment): Promise<any> {
      // Implementation would execute the task in the Docker container
      console.log(`Executing task in Docker container ${this.containerId}`);
      
      // Placeholder
      return { result: 'Simulated Docker execution' };
    }
    
    async cleanup(): Promise<boolean> {
      if (this.containerId) {
        console.log(`Stopping and removing Docker container ${this.containerId}`);
        this.containerId = null;
      }
      return true;
    }
    
    async resolveEnvironmentVariables(requiredVars: EnactEnvironmentVariable[]): Promise<Record<string, any>> {
      const resolved: Record<string, any> = {};
      
      for (const envVar of requiredVars) {
        const { name, required, schema } = envVar;
        
        // In a real implementation, you might get these from Docker secrets
        let value = process.env[name];
        
        if (value === undefined && schema?.default !== undefined) {
          value = schema.default;
        }
        
        if (required && value === undefined) {
          throw new Error(`Missing required environment variable for Docker execution: ${name}`);
        }
        
        if (value !== undefined) {
          resolved[name] = value;
        }
      }
      
      return resolved;
    }
  }
  
  // Windmill execution provider
  class WindmillExecutionProvider extends ExecutionProvider {
    private options: {
      apiUrl: string;
      workspace: string;
      token: string | null;
    };
    
    constructor(options: Record<string, any> = {}) {
      super();
      this.options = {
        apiUrl: options.apiUrl || 'https://app.windmill.dev/api/v1',
        workspace: options.workspace || 'default',
        token: options.token || null
      };
      
      if (!this.options.token) {
        throw new Error('Windmill API token is required');
      }
    }
    
    async setup(task: EnactTask): Promise<boolean> {
      console.log(`Setting up Windmill execution for ${task.language} task`);
      return true;
    }
    
    async executeCode(task: EnactTask, inputs: Record<string, any>, environment: ExecutionEnvironment): Promise<any> {
      console.log(`Executing task in Windmill: ${this.options.apiUrl}`);
      
      // Placeholder for Windmill API call
      return { result: 'Simulated Windmill execution' };
    }
    
    async cleanup(): Promise<boolean> {
      return true;
    }
    
    async resolveEnvironmentVariables(requiredVars: EnactEnvironmentVariable[]): Promise<Record<string, any>> {
      const resolved: Record<string, any> = {};
      
      for (const envVar of requiredVars) {
        const { name, required, schema } = envVar;
        
        // In a real implementation, you would fetch secrets from Windmill
        let value = process.env[name];
        
        if (value === undefined && schema?.default !== undefined) {
          value = schema.default;
        }
        
        if (required && value === undefined) {
          throw new Error(`Missing required environment variable for Windmill execution: ${name}`);
        }
        
        if (value !== undefined) {
          resolved[name] = value;
        }
      }
      
      return resolved;
    }
  }
  
  // Factory for creating execution providers
  class ExecutionEnvironmentFactory {
    static getProvider(type: string, options: Record<string, any> = {}): ExecutionProvider {
      switch (type.toLowerCase()) {
        case 'local':
          return new LocalExecutionProvider();
        case 'docker':
          return new DockerExecutionProvider(options);
        case 'windmill':
          return new WindmillExecutionProvider(options);
        default:
          throw new Error(`Unsupported execution environment: ${type}`);
      }
    }
  }
  
  // Validation functions
  function validateCapabilityStructure(capability: EnactCapability): void {
    const requiredFields = ['enact', 'id', 'description', 'version', 'type', 'tasks', 'flow'];
    
    for (const field of requiredFields) {
      if (!(capability as any)[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    if (capability.type !== 'atomic' && capability.type !== 'composite') {
      throw new Error(`Invalid capability type: ${capability.type}. Must be 'atomic' or 'composite'`);
    }
  }
  
  function validateInputs(inputSpecs: EnactParameter[] | undefined, inputValues: Record<string, any>): void {
    if (!inputSpecs || !Array.isArray(inputSpecs)) {
      return; // No input specs to validate against
    }
    
    for (const inputSpec of inputSpecs) {
      const { name, required, schema } = inputSpec;
      
      if (required && inputValues[name] === undefined) {
        throw new Error(`Missing required input: ${name}`);
      }
      
      if (inputValues[name] !== undefined) {
        validateAgainstSchema(inputValues[name], schema, name);
      }
    }
  }
  
  function validateAgainstSchema(value: any, schema: EnactSchema, fieldName: string): void {
    const { type, format, enum: enumValues, minimum, maximum, pattern } = schema;
    
    // Type validation
    if (type) {
      let validType = false;
      
      switch (type) {
        case 'string':
          validType = typeof value === 'string';
          break;
        case 'number':
        case 'integer':
          validType = typeof value === 'number';
          if (type === 'integer' && !Number.isInteger(value)) {
            validType = false;
          }
          break;
        case 'boolean':
          validType = typeof value === 'boolean';
          break;
        case 'array':
          validType = Array.isArray(value);
          break;
        case 'object':
          validType = typeof value === 'object' && value !== null && !Array.isArray(value);
          break;
      }
      
      if (!validType) {
        throw new Error(`Invalid type for ${fieldName}: expected ${type}`);
      }
    }
    
    // Format validation (simplified)
    if (format && type === 'string') {
      const formatValidators: Record<string, RegExp> = {
        'email': /^.+@.+\..+$/,
        'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      };
      
      if (formatValidators[format] && !formatValidators[format].test(value)) {
        throw new Error(`Invalid format for ${fieldName}: expected ${format}`);
      }
    }
    
    // Enum validation
    if (enumValues && !enumValues.includes(value)) {
      throw new Error(`Invalid value for ${fieldName}: must be one of [${enumValues.join(', ')}]`);
    }
    
    // Range validation for numbers
    if ((minimum !== undefined || maximum !== undefined) && typeof value === 'number') {
      if (minimum !== undefined && value < minimum) {
        throw new Error(`Value for ${fieldName} must be >= ${minimum}`);
      }
      if (maximum !== undefined && value > maximum) {
        throw new Error(`Value for ${fieldName} must be <= ${maximum}`);
      }
    }
    
    // Pattern validation for strings
    if (pattern && typeof value === 'string' && !new RegExp(pattern).test(value)) {
      throw new Error(`Value for ${fieldName} must match pattern: ${pattern}`);
    }
  }
  
  function formatOutputs(outputSpecs: EnactParameter[] | undefined, results: Record<string, any>): Record<string, any> {
    if (!outputSpecs || !Array.isArray(outputSpecs)) {
      return results; // Return raw results if no output specs
    }
    
    const formattedOutputs: Record<string, any> = {};
    
    for (const outputSpec of outputSpecs) {
      const { name, schema } = outputSpec;
      
      let outputValue = undefined;
      
      // Check in each task result for the output
      for (const taskId in results) {
        const taskResult = results[taskId];
        
        if (taskResult && taskResult[name] !== undefined) {
          outputValue = taskResult[name];
          break;
        }
      }
      
      // Validate the output against its schema
      if (outputValue !== undefined && schema) {
        validateAgainstSchema(outputValue, schema, `output.${name}`);
      }
      
      formattedOutputs[name] = outputValue;
    }
    
    return formattedOutputs;
  }
  
  function generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  // Main execution function
  async function executeEnactCapability(
    capability: EnactCapability, 
    inputs: Record<string, any> = {}, 
    options: Record<string, any> = {}
  ): Promise<ExecutionResult> {
    // Get configuration
    const config = EnactConfig.getInstance();
    
    // Use config values, but allow overrides from options
    const environmentType = options.environmentType || config.get<string>('executionEnvironment', 'local');
    const environmentOptions = {
      ...config.get<Record<string, any>>('environmentOptions', {}),
      ...options.environmentOptions
    };
    
    let provider: ExecutionProvider | null = null;
    
    try {
      // 1. Validate the capability structure
      validateCapabilityStructure(capability);
      
      // 2. Validate inputs against the capability's input schema
      validateInputs(capability.inputs, inputs);
      
      // 3. Get the appropriate execution provider
      provider = ExecutionEnvironmentFactory.getProvider(environmentType, environmentOptions);
      
      // 4. Resolve environment variables
      const envVars = capability.env?.vars || [];
      const resolvedEnv = await provider.resolveEnvironmentVariables(envVars);
      
      // Merge with provided environment variables (overrides)
      const environment: ExecutionEnvironment = {
        variables: { ...resolvedEnv, ...(options.providedEnv || {}) },
        resources: capability.env?.resources
      };
      
      const results: Record<string, any> = {};
      
      // 5. For each task in the flow, set up environment and execute
      for (const step of capability.flow.steps) {
        const taskId = step.task;
        const task = capability.tasks.find(t => t.id === taskId);
        
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }
        
        // Setup execution environment for the task
        await provider.setup(task, task.dependencies);
        
        // Execute the task
        try {
          const result = await provider.executeCode(task, inputs, environment);
          results[taskId] = result;
        } finally {
          // Clean up resources
          await provider.cleanup();
        }
      }
      
      // 6. Format and validate outputs
      const outputs = formatOutputs(capability.outputs, results);
      
      return {
        success: true,
        outputs,
        metadata: {
          capabilityId: capability.id,
          version: capability.version,
          executedAt: new Date().toISOString(),
          environment: environmentType
        }
      };
    } catch (error) {
      // Ensure cleanup happens even on error
      if (provider) {
        try {
          await provider.cleanup();
        } catch (cleanupError) {
          console.error('Error during cleanup:', cleanupError);
        }
      }
      
      return {
        success: false,
        error: {
          message: (error as Error).message,
          code: 'EXECUTION_ERROR',
          details: error
        },
        metadata: {
          capabilityId: capability.id,
          version: capability.version,
          executedAt: new Date().toISOString(),
          environment: environmentType
        }
      };
    }
  }
  
  // Mock registry function
  // Mock registry function
async function fetchCapabilityById(id: string): Promise<EnactCapability | null> {
    console.log(`Fetching capability with ID: ${id}`);
    
    // Simulate registry lookup delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return mock data for demonstration
    if (id === 'GetStockPrice') {
      return {
        enact: '1.0.0',
        id: 'GetStockPrice',
        description: 'Retrieves the current stock price for a given ticker symbol.',
        version: '1.0.0',
        type: 'atomic',
        authors: [{ name: 'Jane Doe' }],
        inputs: [
          {
            name: 'ticker',
            description: 'The stock ticker symbol (e.g., AAPL)',
            required: true,
            schema: { type: 'string' }
          }
        ],
        tasks: [
          {
            id: 'fetchPrice',
            type: 'script',
            language: 'javascript',
            code: `
              // This would normally make an API call to a stock service
              // For demo purposes, we'll generate a random price
              const ticker = inputs.ticker.toUpperCase();
              const basePrice = ticker.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 1000;
              const randomFactor = 0.9 + (Math.random() * 0.2);
              const price = Math.round(basePrice * randomFactor * 100) / 100;
              
              output.price = price;
              output.currency = 'USD';
              output.timestamp = new Date().toISOString();
            `
          }
        ],
        flow: {
          steps: [
            { task: 'fetchPrice' }
          ]
        },
        outputs: [
          {
            name: 'price',
            description: 'The current stock price',
            schema: { type: 'number', format: 'float' }
          },
          {
            name: 'currency',
            description: 'The currency of the price',
            schema: { type: 'string' }
          },
          {
            name: 'timestamp',
            description: 'The timestamp of the price',
            schema: { type: 'string', format: 'date-time' }
          }
        ]
      };
    } else if (id === 'FormatGreeting') {
      return {
        enact: '1.0.0',
        id: 'FormatGreeting',
        description: 'Creates a personalized greeting message with optional time-based salutations',
        version: '1.0.0',
        type: 'atomic',
        authors: [{ name: 'Claude Assistant' }],
        inputs: [
          {
            name: 'name',
            description: 'The name of the person to greet',
            required: true,
            schema: { type: 'string' }
          },
          {
            name: 'includeTime',
            description: 'Whether to include a time-based greeting (e.g., good morning)',
            required: false,
            schema: { 
              type: 'boolean',
              default: false
            }
          },
          {
            name: 'language',
            description: 'The language to use for the greeting',
            required: false,
            schema: {
              type: 'string',
              enum: ["english", "spanish", "french", "japanese"],
              default: "english"
            }
          }
        ],
        tasks: [
          {
            id: 'createGreeting',
            type: 'script',
            language: 'javascript',
            code: `
              // Get inputs with defaults
              const personName = inputs.name;
              const includeTime = inputs.includeTime || false;
              const language = inputs.language || "english";
              
              // Helper function to get time-based greeting
              function getTimeGreeting(lang) {
                const hour = new Date().getHours();
                
                if (lang === "english") {
                  if (hour < 12) return "Good morning";
                  if (hour < 18) return "Good afternoon";
                  return "Good evening";
                } else if (lang === "spanish") {
                  if (hour < 12) return "Buenos días";
                  if (hour < 18) return "Buenas tardes";
                  return "Buenas noches";
                } else if (lang === "french") {
                  if (hour < 12) return "Bonjour";
                  if (hour < 18) return "Bon après-midi";
                  return "Bonsoir";
                } else if (lang === "japanese") {
                  if (hour < 12) return "おはようございます";
                  if (hour < 18) return "こんにちは";
                  return "こんばんは";
                }
                
                return "Hello"; // Default fallback
              }
              
              // Get basic greeting by language
              function getBasicGreeting(lang) {
                const greetings = {
                  "english": "Hello",
                  "spanish": "Hola",
                  "french": "Salut",
                  "japanese": "こんにちは"
                };
                
                return greetings[lang] || "Hello";
              }
              
              // Create the greeting
              let greeting = "";
              
              if (includeTime) {
                greeting = \`\${getTimeGreeting(language)}, \${personName}!\`;
              } else {
                greeting = \`\${getBasicGreeting(language)}, \${personName}!\`;
              }
              
              // Add a timestamp for when this greeting was generated
              const timestamp = new Date().toISOString();
              
              // Set outputs
              output.greeting = greeting;
              output.timestamp = timestamp;
              output.language = language;
            `
          }
        ],
        flow: {
          steps: [
            { task: 'createGreeting' }
          ]
        },
        outputs: [
          {
            name: 'greeting',
            description: 'The formatted greeting message',
            schema: { type: 'string' }
          },
          {
            name: 'timestamp',
            description: 'The time when the greeting was generated',
            schema: { 
              type: 'string',
              format: 'date-time'
            }
          },
          {
            name: 'language',
            description: 'The language used for the greeting',
            schema: { type: 'string' }
          }
        ]
      };
    }
    
    return null;
  }
  
  // Execute capability by ID function
  async function executeCapabilityById(
    id: string, 
    args: Record<string, any> = {}
  ): Promise<ExecutionResult> {
    try {
      // Fetch the capability
      const capability = await fetchCapabilityById(id);
      
      if (!capability) {
        return {
          success: false,
          error: {
            message: `Capability not found: ${id}`,
            code: 'NOT_FOUND'
          },
          metadata: {
            capabilityId: id,
            version: 'unknown',
            executedAt: new Date().toISOString(),
            environment: EnactConfig.getInstance().get('executionEnvironment', 'local')
          }
        };
      }
      
      // Execute the capability
      return await executeEnactCapability(capability, args);
    } catch (error) {
      return {
        success: false,
        error: {
          message: (error as Error).message,
          code: 'EXECUTION_ERROR'
        },
        metadata: {
          capabilityId: id,
          version: 'unknown',
          executedAt: new Date().toISOString(),
          environment: EnactConfig.getInstance().get('executionEnvironment', 'local')
        }
      };
    }
  }
  
  // Initialize Enact system
  function initializeEnact(configPath?: string): EnactConfig {
    const config = EnactConfig.getInstance();
    
    if (configPath) {
      config.loadFromFile(configPath);
    }
    
    const logLevel = config.get<string>('logLevel', 'info');
    console.log(`Initializing Enact system with log level: ${logLevel}`);
    
    return config;
  }
  
  
export {
    EnactConfig,
    initializeEnact,
    executeCapabilityById,
    executeEnactCapability,
}
export type {
        // Types
        EnactCapability,
        EnactParameter,
        EnactTask,
        EnactFlow,
        ExecutionResult
    }
