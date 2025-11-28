import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { BetoMarketplaceSettings, DEFAULT_SETTINGS, BetoMarketplaceSettingTab } from './src/settings';
import { DatacoreDownloader } from './src/downloader';
import { AuthManager } from './src/auth';
import { ComponentManager } from './src/manager';
import { ConfirmModal } from './src/confirm-modal';
import { PROTOCOL_ACTION_AUTH, PROTOCOL_ACTION_DEPLOY } from './src/constants';

export default class BetoMarketplace extends Plugin {
	settings: BetoMarketplaceSettings;
	downloader: DatacoreDownloader;
	authManager: AuthManager;
	componentManager: ComponentManager;
	settingTab: BetoMarketplaceSettingTab;

	async onload() {
		await this.loadSettings();
		
		this.downloader = new DatacoreDownloader(this.app, this.settings);
		this.componentManager = new ComponentManager(this.app, this.settings);
		
		this.settingTab = new BetoMarketplaceSettingTab(this.app, this, this.componentManager);

		this.authManager = new AuthManager(this.app, this.settings, this.saveSettings.bind(this), () => {
			this.settingTab.updateUserAndRefreshAccount();
		});

		this.addRibbonIcon('box', 'Beto Marketplace', () => {
			this.openSettings();
		});

		this.addCommand({
			id: 'open-beto-marketplace-settings',
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

			// If we received an auth code and we are not logged in (or want to refresh), exchange it
			if (code && !this.settings.authToken) {
				// new Notice("Authenticating with Beto Marketplace...");
				const newToken = await this.authManager.handleAuthCallback(code);
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

			// SECURITY: Ask for confirmation before downloading
			new ConfirmModal(
				this.app,
				'Install Component?',
				`Do you want to download and install the component "${id}"? This will add files to your vault.`,
				async () => {
					await this.downloader.downloadComponent(id, authToken);
				}
			).open();
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

