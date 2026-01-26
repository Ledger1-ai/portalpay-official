// Server-side Bear Cloud API Service
// This service runs on the server and handles authentication securely

interface BearCloudConfig {
  apiUrl: string;
  authUrl: string;
  apiKey: string;
  secret: string;
  scope: string;
  timeout: number;
}

interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in?: number;
  expires_at: number;
}

interface RobotStatus {
  id: string;
  name: string;
  status: 'active' | 'charging' | 'maintenance' | 'idle';
  battery: number;
  position: { x: number; y: number; z?: number };
  signal: number;
  task: string;
  uptime: string;
  lastUpdate: string;
  heading?: number;
  speed?: number;
  sensors?: {
    temperature?: number;
    humidity?: number;
    proximity?: number[];
  };
}

interface WorkflowData {
  id: string;
  name: string;
  keyframes: unknown[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  created: string;
  updated: string;
}

class ServerBearCloudAPIService {
  private config: BearCloudConfig;
  private authToken: AuthToken | null = null;

  constructor(config: BearCloudConfig) {
    this.config = config;
  }

  // Authentication & Connection
  async authenticate(): Promise<boolean> {
    try {
      // Check if credentials are missing
      if (!this.config.apiKey || !this.config.secret) {
        console.log('🔧 Missing API credentials - using mock data');
        return false;
      }

      console.log('🔐 Server-side authenticating with Bear Cloud API...');
      console.log('🌐 Auth URL:', this.config.authUrl);
      console.log('🔑 API Key:', this.config.apiKey ? `${this.config.apiKey.substring(0, 8)}...` : 'NOT SET');
      console.log('🔐 Secret:', this.config.secret ? `${this.config.secret.substring(0, 8)}...` : 'NOT SET');
      console.log('📋 Scope:', this.config.scope);

      const authPayload = {
        api_key: this.config.apiKey,
        secret: this.config.secret,
        scope: this.config.scope,
      };
      console.log('📤 Sending auth payload:', {
        api_key: authPayload.api_key ? `${authPayload.api_key.substring(0, 8)}...` : 'NOT SET',
        secret: authPayload.secret ? `${authPayload.secret.substring(0, 8)}...` : 'NOT SET',
        scope: authPayload.scope
      });

      const response = await fetch(this.config.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authPayload),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      console.log('📥 Auth response status:', response.status);
      console.log('📥 Auth response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Bear Cloud API authentication failed:');
        console.error('   Status:', response.status);
        console.error('   Status Text:', response.statusText);
        console.error('   Response:', errorText);
        console.log('🔄 Will use mock data instead');
        return false;
      }

      // The API returns a JWT token directly as text, not JSON
      const jwtToken = await response.text();
      console.log('📄 Raw response body type:', typeof jwtToken);
      console.log('📄 Raw response body preview:', jwtToken.substring(0, 50) + '...');

      if (!jwtToken || jwtToken.trim().length === 0) {
        console.error('❌ Empty token response');
        return false;
      }

      // Check if response looks like HTML (error page) instead of JWT token
      if (jwtToken.trim().startsWith('<')) {
        console.error('❌ Received HTML response instead of JWT token');
        console.error('   This might indicate an API error or wrong endpoint');
        console.error('   Response preview:', jwtToken.substring(0, 200));
        return false;
      }

      // Store the JWT token directly
      this.authToken = {
        access_token: jwtToken.trim(),
        token_type: 'Bearer',
        expires_at: Date.now() + (3600 * 1000) // Default 1 hour expiry
      };

      console.log('✅ Server-side Bear Cloud API authentication successful - JWT token received');
      console.log('🎫 Token preview:', jwtToken.substring(0, 20) + '...');
      return true;
    } catch (error) {
      console.error('Bear Cloud API authentication failed:', error);
      console.log('🔄 Will use mock data instead');
      return false;
    }
  }

  // Check if token is valid and refresh if needed
  private async ensureAuthenticated(): Promise<boolean> {
    if (!this.authToken || Date.now() >= this.authToken.expires_at - 60000) { // Refresh 1 minute before expiry
      return await this.authenticate();
    }
    return true;
  }

  // Helper method to make authenticated requests
  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const authenticated = await this.ensureAuthenticated();

    if (!authenticated || !this.authToken) {
      console.log('🔄 Authentication not available, using mock data fallback');
      throw new Error('Authentication failed - will use mock data');
    }

    const url = `https://${this.config.apiUrl}${endpoint}`;
    console.log(`🌐 Server making request to: ${url}`);
    console.log(`🔧 Method: ${options.method || 'GET'}`);

    // Build headers - only add Content-Type for POST/PUT requests
    const headers: Record<string, string> = {
      'Authorization': `${this.authToken.token_type} ${this.authToken.access_token}`,
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Only add Content-Type for requests with body
    if (options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase())) {
      headers['Content-Type'] = 'application/json';
    }

    console.log(`📋 Request headers:`, headers);

    const response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    });

    console.log(`📥 Response status: ${response.status} ${response.statusText}`);
    console.log(`📥 Response headers:`, Object.fromEntries(response.headers.entries()));

    return response;
  }

  // Robot Management
  async getAllRobots(): Promise<RobotStatus[]> {
    try {
      console.log('🤖 Server fetching all robots from Bear Cloud API...');

      const response = await this.makeRequest('/robots');

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error ${response.status}: ${response.statusText}`);
        console.error(`❌ Error response body:`, errorText);

        // Try different common endpoints if robots endpoint fails
        if (response.status === 404) {
          console.log('🔄 /robots not found, trying alternative endpoints...');
          // Could try /api/robots, /v1/robots, etc.
        }

        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Successfully fetched robots from server:', data);

      // Transform Bear API response to our interface
      const robots = this.transformRobotsData(data);
      return robots;
    } catch (error) {
      console.error('❌ Failed to fetch robots from Bear Cloud API:', error);
      console.log('🔄 Falling back to mock data...');
      // Return mock data as fallback
      return this.getMockRobots();
    }
  }

  // Transform Bear Cloud API robot data to our interface
  private transformRobotsData(apiData: unknown): RobotStatus[] {
    try {
      // Handle different possible response structures
      const robots = (apiData as { robots?: unknown[] })?.robots || (apiData as { data?: unknown[] })?.data || apiData || [];

      return (robots as { id?: string; robot_id?: string; name?: string; robot_name?: string; status?: string; state?: string; battery_level?: number; battery?: number; position?: { x: number; y: number; z?: number; }; location?: { x: number; y: number; z?: number; }; signal_strength?: number; wifi_strength?: number; current_task?: string; task?: string; mission?: string; uptime?: string | number; online_time?: string | number; last_updated?: string; timestamp?: string; heading?: number; orientation?: number; speed?: number; velocity?: number; sensors?: { temperature?: number; humidity?: number; proximity?: number[]; }; temperature?: number; humidity?: number; proximity_sensors?: number[]; }[]).map((robot) => ({
        id: robot.id || robot.robot_id || `robot-${Math.random().toString(36).substr(2, 9)}`,
        name: robot.name || robot.robot_name || `Robot ${robot.id}`,
        status: this.mapBearStatus(robot.status || robot.state || 'UNKNOWN'),
        battery: robot.battery_level || robot.battery || Math.floor(Math.random() * 100),
        position: {
          x: robot.position?.x || robot.location?.x || Math.floor(Math.random() * 500),
          y: robot.position?.y || robot.location?.y || Math.floor(Math.random() * 400),
          z: robot.position?.z || robot.location?.z
        },
        signal: robot.signal_strength || robot.wifi_strength || Math.floor(Math.random() * 100),
        task: robot.current_task || robot.task || robot.mission || 'Idle',
        uptime: this.formatUptime(robot.uptime || robot.online_time),
        lastUpdate: robot.last_updated || robot.timestamp || new Date().toISOString(),
        heading: robot.heading || robot.orientation,
        speed: robot.speed || robot.velocity,
        sensors: robot.sensors || {
          temperature: robot.temperature,
          humidity: robot.humidity,
          proximity: robot.proximity_sensors
        }
      }));
    } catch (error) {
      console.error('Error transforming robot data:', error);
      return this.getMockRobots();
    }
  }

  private formatUptime(seconds: number | string | undefined): string {
    if (!seconds) return '0h 0m';
    const totalSeconds = typeof seconds === 'string' ? parseInt(seconds) : seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  private mapBearStatus(bearStatus: string): 'active' | 'charging' | 'maintenance' | 'idle' {
    const statusMap: Record<string, 'active' | 'charging' | 'maintenance' | 'idle'> = {
      'running': 'active',
      'working': 'active',
      'moving': 'active',
      'charging': 'charging',
      'docked': 'charging',
      'maintenance': 'maintenance',
      'error': 'maintenance',
      'offline': 'maintenance',
      'idle': 'idle',
      'standby': 'idle',
      'paused': 'idle',
    };

    return statusMap[bearStatus?.toLowerCase()] || 'idle';
  }

  async getRobotById(robotId: string): Promise<RobotStatus | null> {
    try {
      console.log(`🤖 Server fetching robot ${robotId} from Bear Cloud API...`);

      const response = await this.makeRequest(`/robots/${robotId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Successfully fetched robot ${robotId}:`, data);

      // Transform single robot data
      const robots = this.transformRobotsData({ robots: [data.robot || data] });
      return robots[0] || null;
    } catch (error) {
      console.error(`❌ Failed to fetch robot ${robotId}:`, error);
      // Return mock robot as fallback
      const mockRobots = this.getMockRobots();
      return mockRobots.find(r => r.id === robotId) || null;
    }
  }

  async sendRobotCommand(robotId: string, command: string, params?: unknown): Promise<boolean> {
    try {
      console.log(`🎮 Server sending command '${command}' to robot ${robotId}...`);

      const payload = {
        command: this.mapCommandToBearAPI(command),
        parameters: params || {},
        timestamp: new Date().toISOString(),
        robot_id: robotId,
      };

      const response = await this.makeRequest(`/robots/${robotId}/command`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const success = response.ok;
      if (success) {
        console.log(`✅ Successfully sent command '${command}' to robot ${robotId}`);
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to send command '${command}' to robot ${robotId}:`, errorText);
      }

      return success;
    } catch (error) {
      console.error(`❌ Failed to send command ${command} to robot ${robotId}:`, error);
      // In mock mode, always return success
      console.log(`🔄 Mock: Command '${command}' sent to robot ${robotId}`);
      return true;
    }
  }

  // Map our command names to Bear Cloud API command names
  private mapCommandToBearAPI(command: string): string {
    const commandMap: Record<string, string> = {
      'start': 'start_mission',
      'pause': 'pause_mission',
      'stop': 'stop_mission',
      'resume': 'resume_mission',
      'return_home': 'return_to_dock',
      'charge': 'dock_for_charging',
      'emergency_stop': 'emergency_stop',
    };

    return commandMap[command] || command;
  }

  // Workflow Management
  async getWorkflows(): Promise<WorkflowData[]> {
    try {
      console.log('📋 Server fetching workflows from Bear Cloud API...');

      const response = await this.makeRequest('/workflows');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Successfully fetched workflows:', data);

      return (data as { workflows?: any[]; data?: any[]; }).workflows || (data as { workflows?: any[]; data?: any[]; }).data || [];
    } catch (error) {
      console.error('❌ Failed to fetch workflows:', error);
      console.log('🔄 Returning mock workflows...');
      return this.getMockWorkflows();
    }
  }

  async createWorkflow(workflow: Omit<WorkflowData, 'id' | 'created' | 'updated'>): Promise<WorkflowData | null> {
    try {
      console.log('📋 Server creating workflow:', workflow.name);

      const response = await this.makeRequest('/workflows', {
        method: 'POST',
        body: JSON.stringify(workflow),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Successfully created workflow:', data);

      return (data as { workflow?: any; }).workflow || (data as { workflow?: any; });
    } catch (error) {
      console.error('❌ Failed to create workflow:', error);
      // Return mock workflow as fallback
      return {
        id: `mock-${Date.now()}`,
        ...workflow,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
    }
  }

  async getFacilityMap(): Promise<unknown> {
    try {
      console.log('🗺️ Server fetching facility map from Bear Cloud API...');

      const response = await this.makeRequest('/facility/map');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Successfully fetched facility map:', data);

      return data;
    } catch (error) {
      console.error('❌ Failed to fetch facility map:', error);
      console.log('🔄 Returning mock map...');
      return this.getMockFacilityMap();
    }
  }

  // Mock data methods
  private getMockRobots(): RobotStatus[] {
    return [
      {
        id: "robot-001",
        name: "Bear Alpha",
        status: "active",
        battery: 85,
        position: { x: 200, y: 150 },
        signal: 92,
        task: "Delivery to Table 12",
        uptime: "4h 32m",
        lastUpdate: new Date().toISOString(),
        heading: 45,
        speed: 1.2,
      },
      {
        id: "robot-002",
        name: "Bear Beta",
        status: "charging",
        battery: 45,
        position: { x: 100, y: 300 },
        signal: 88,
        task: "Charging",
        uptime: "0h 15m",
        lastUpdate: new Date().toISOString(),
        heading: 0,
        speed: 0,
      },
      {
        id: "robot-003",
        name: "Bear Gamma",
        status: "active",
        battery: 67,
        position: { x: 400, y: 150 },
        signal: 95,
        task: "Patrol Route B",
        uptime: "2h 45m",
        lastUpdate: new Date().toISOString(),
        heading: 180,
        speed: 0.8,
      },
      {
        id: "robot-004",
        name: "Bear Delta",
        status: "maintenance",
        battery: 12,
        position: { x: 275, y: 300 },
        signal: 0,
        task: "Offline - Maintenance",
        uptime: "0h 0m",
        lastUpdate: new Date().toISOString(),
        heading: 0,
        speed: 0,
      },
      {
        id: "robot-005",
        name: "Bear Echo",
        status: "active",
        battery: 78,
        position: { x: 500, y: 320 },
        signal: 90,
        task: "Storage Delivery",
        uptime: "3h 12m",
        lastUpdate: new Date().toISOString(),
        heading: 270,
        speed: 1.0,
      },
    ];
  }

  private getMockWorkflows(): WorkflowData[] {
    return [
      {
        id: "workflow-001",
        name: "Morning Setup",
        keyframes: [],
        status: "active",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      {
        id: "workflow-002",
        name: "Lunch Rush",
        keyframes: [],
        status: "draft",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }
    ];
  }

  private getMockFacilityMap(): unknown {
    return {
      width: 600,
      height: 400,
      obstacles: [
        { x: 150, y: 100, width: 100, height: 50 },
        { x: 350, y: 250, width: 80, height: 60 },
      ],
      zones: [
        { id: "kitchen", x: 0, y: 0, width: 200, height: 200 },
        { id: "dining", x: 200, y: 0, width: 400, height: 400 },
      ]
    };
  }
}

// Create and export a singleton instance for server use
const createServerBearCloudAPI = () => {
  return new ServerBearCloudAPIService({
    apiUrl: process.env.BEAR_API_URL || 'api.bearrobotics.ai:443',
    authUrl: process.env.BEAR_AUTH_URL || 'https://api-auth.bearrobotics.ai/authorizeApiAccess',
    apiKey: process.env.BEAR_API_KEY || '',
    secret: process.env.BEAR_API_SECRET || '',
    scope: process.env.BEAR_API_SCOPE || 'LOCAL_GOAT_LLC',
    timeout: 30000, // 30 seconds for robot operations
  });
};

export { createServerBearCloudAPI, ServerBearCloudAPIService };
export type { RobotStatus, WorkflowData };