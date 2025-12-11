import { Notice, Plugin, WorkspaceLeaf, requestUrl, RequestUrlParam } from 'obsidian';
import { BetoNexusSettings, DEFAULT_SETTINGS, BetoNexusSettingTab } from './src/settings';
import { BetoNexusView, VIEW_TYPE_BETO_NEXUS } from './src/view';
import { DatacoreDownloader } from './src/downloader';
import { AuthManager } from './src/auth';
import { ComponentManager } from './src/manager';
import { PROTOCOL_ACTION_AUTH, PROTOCOL_ACTION_DEPLOY, API_URL, PLUGIN_HEADERS } from './src/constants';
import { EncryptionService } from './src/encryption';

export interface BetoNexusAPI {
	apiVersion: string;
	isAuthenticated(): boolean;
	getUser(): Promise<any | null>;
	login(code: string): Promise<boolean>;
	logout(): void;
	fetch(endpoint: string, options?: RequestUrlParam): Promise<any>;
}

export default class BetoNexus extends Plugin {
	settings: BetoNexusSettings;
	downloader: DatacoreDownloader;
	authManager: AuthManager;
	componentManager: ComponentManager;
	settingTab: BetoNexusSettingTab;
	api: BetoNexusAPI;

	async onload() {
		await this.loadSettings();
		
		this.downloader = new DatacoreDownloader(this.app, this.settings);
		this.componentManager = new ComponentManager(this.app, this.settings);
		
		this.settingTab = new BetoNexusSettingTab(this.app, this, this.componentManager);

		this.authManager = new AuthManager(this.app, this.settings, this.saveSettings.bind(this), () => {
			this.settingTab.updateUserAndRefreshAccount();
		});

		// Initialize Public API
		this.api = {
			apiVersion: "1.0.0",
			isAuthenticated: () => !!this.settings.authToken,
			getUser: async () => {
				if (!this.settings.authToken) return null;
				try {
					const encryptedPayload = await EncryptionService.encrypt({
						_action: 'auth/me'
					});

					const response = await requestUrl({
						url: `${API_URL}/api/ops`,
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${this.settings.authToken}`,
							'X-Device-Id': this.settings.deviceId,
							'Content-Type': 'application/json',
							...PLUGIN_HEADERS
						},
						body: JSON.stringify(encryptedPayload)
					});
					
					if (response.status === 200) {
						const data = response.json;
						if (data.encrypted) {
							const decrypted = await EncryptionService.decrypt(data);
							return decrypted.user;
						}
						return data.user;
					}
					return null;
				} catch (e) {
					console.error("Beto API: Failed to fetch user", e);
					return null;
				}
			},
			login: async (code: string) => {
				const token = await this.authManager.handleAuthCallback(code);
				return !!token;
			},
			logout: () => {
				this.authManager.logout();
			},
			fetch: async (endpoint: string, options: RequestUrlParam = { url: '' }) => {
				// Map endpoint to action if possible, otherwise use legacy fetch
				// This is a simplified mapping for the public API
				let action = '';
				if (endpoint === '/api/auth/me') action = 'auth/me';
				
				if (action) {
					const payload = options.body ? JSON.parse(options.body as string) : {};
					const encryptedPayload = await EncryptionService.encrypt({
						_action: action,
						...payload
					});

					const headers: Record<string, string> = {
						'Content-Type': 'application/json',
						'X-Device-Id': this.settings.deviceId,
						...PLUGIN_HEADERS,
						...(options.headers as Record<string, string> || {})
					};

					if (this.settings.authToken) {
						headers['Authorization'] = `Bearer ${this.settings.authToken}`;
					}

					const response = await requestUrl({
						url: `${API_URL}/api/ops`,
						method: 'POST',
						headers,
						body: JSON.stringify(encryptedPayload)
					});

					if (response.status >= 200 && response.status < 300) {
						const data = response.json;
						if (data.encrypted) {
							return await EncryptionService.decrypt(data);
						}
						return data;
					}
					throw new Error(`API Error: ${response.status} ${response.text}`);
				}

				// Legacy Fetch
				const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
				const url = `${API_URL}${path}`;
				
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
					'X-Device-Id': this.settings.deviceId,
					...PLUGIN_HEADERS,
					...(options.headers as Record<string, string> || {})
				};

				if (this.settings.authToken) {
					headers['Authorization'] = `Bearer ${this.settings.authToken}`;
				}

				const response = await requestUrl({
					...options,
					url,
					headers
				});

				if (response.status >= 200 && response.status < 300) {
					return response.json;
				}
				throw new Error(`API Error: ${response.status} ${response.text}`);
			}
		};

		this.registerView(
			VIEW_TYPE_BETO_NEXUS,
			(leaf) => new BetoNexusView(leaf, this.componentManager, this.settings, this.api, () => this.openSettings())
		);

		this.addRibbonIcon('box', 'Beto Nexus', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-beto-nexus-settings',
			name: 'Open settings',
			callback: () => {
				this.openSettings();
			}
		});

		this.registerObsidianProtocolHandler(PROTOCOL_ACTION_DEPLOY, async (params) => {
			const { id, token, code } = params;
			
			if (!id) {
				new Notice("Missing 'id' in protocol URL.");
				return;
			}

			// If we received an auth code, exchange it to sync account with website
			// This ensures the plugin uses the same account that initiated the deploy
			if (code) {
				// Check if we're already logged in - if so, use silent mode to avoid redundant notice
				const wasLoggedIn = !!this.settings.authToken;
				const newToken = await this.authManager.handleAuthCallback(code, wasLoggedIn);
				if (newToken) {
					this.settings.authToken = newToken;
					// Ensure downloader has latest settings
					this.downloader.settings = this.settings;
				}
			}

			// Use provided token (OTP) OR fallback to stored auth token
			const authToken = token || this.settings.authToken;

			if (!authToken) {
				new Notice("Authentication required. Please log in or use a valid deploy link.");
				return;
			}

			// Update settings reference in downloader in case they changed
			this.downloader.settings = this.settings;

			// Direct download as components are trusted
			await this.downloader.downloadComponent(id, authToken);
		});

		this.registerObsidianProtocolHandler(PROTOCOL_ACTION_AUTH, async (params) => {
			const { code } = params;
			if (code) {
				await this.authManager.handleAuthCallback(code);
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(this.settingTab);
	}

	onunload() {

	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_BETO_NEXUS);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_BETO_NEXUS, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	openSettings() {
		// @ts-ignore
		this.app.setting.open();
		// @ts-ignore
		this.app.setting.openTabById(this.manifest.id);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// Generate a unique device ID if one doesn't exist
		if (!this.settings.deviceId) {
			this.settings.deviceId = crypto.randomUUID();
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

