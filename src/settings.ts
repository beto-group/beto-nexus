import { App, PluginSettingTab, Setting, Plugin, setIcon, requestUrl, Platform } from 'obsidian';
import { API_URL, FRONTEND_URL, PLUGIN_HEADERS } from './constants';
import { ComponentManager } from './manager';

export interface BetoMarketplaceSettings {
	downloadFolder: string;
	authToken: string | null;
	deviceId: string;
}

export const DEFAULT_SETTINGS: BetoMarketplaceSettings = {
	downloadFolder: '_RESOURCES/DATACORE',
	authToken: null,
	deviceId: ''
}

export class BetoMarketplaceSettingTab extends PluginSettingTab {
	plugin: Plugin & { settings: BetoMarketplaceSettings; saveSettings: () => Promise<void> };
	manager: ComponentManager;
	userProfile: any = null;
	accountSectionContainer: HTMLElement | null = null;
	accountDetailsEl: HTMLDetailsElement | null = null;

	constructor(app: App, plugin: Plugin & { settings: BetoMarketplaceSettings; saveSettings: () => Promise<void> }, manager: ComponentManager) {
		super(app, plugin);
		this.plugin = plugin;
		this.manager = manager;
	}

	async fetchUserProfile() {
		if (!this.plugin.settings.authToken) {
			this.userProfile = null;
			return;
		}

		try {
			const response = await requestUrl({
				url: `${API_URL}/api/auth/me`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.plugin.settings.authToken}`,
					'X-Device-Id': this.plugin.settings.deviceId,
					'Content-Type': 'application/json',
					...PLUGIN_HEADERS
				}
			});

			if (response.status === 200) {
				this.userProfile = response.json.user;
			} else {
				// Token invalid
				this.plugin.settings.authToken = null;
				await this.plugin.saveSettings();
				this.userProfile = null;
			}
		} catch (error) {
			// console.error('Failed to fetch user profile:', error);
			this.userProfile = null;
		}
	}

	async updateUserAndRefreshAccount() {
		await this.fetchUserProfile();
		this.renderAccountSection();
	}

	openExternal(url: string) {
		if (Platform.isDesktopApp) {
			// @ts-ignore
			const { shell } = require('electron');
			shell.openExternal(url);
		} else {
			window.open(url, '_blank');
		}
	}

	async display(): Promise<void> {
		const {containerEl} = this;
		containerEl.empty();

		// Fetch profile if we have a token but no profile data yet
		if (this.plugin.settings.authToken && !this.userProfile) {
			await this.fetchUserProfile();
		}

		// --- Top Bar (Excalidraw Style) ---
		const topBar = containerEl.createDiv({ cls: 'beto-settings-header' });
		
		// Support Button
		const supportBtn = topBar.createEl('a', { 
			cls: 'beto-support-button', 
			text: 'Visit Marketplace' 
		});
		supportBtn.onclick = (e) => {
			e.preventDefault();
			this.openExternal('https://marketplace.beto.group');
		};
		setIcon(supportBtn, 'shopping-cart'); // Or 'heart'

		// Social Links
		const socialLinks = topBar.createDiv({ cls: 'beto-social-links' });
		this.createSocialLink(socialLinks, 'Documentation', 'book-open', 'https://marketplace.beto.group/docs');
		this.createSocialLink(socialLinks, 'Discord', 'message-circle', 'https://discord.com/invite/6rDp4q4Y2B');
		this.createSocialLink(socialLinks, 'GitHub', 'github', 'https://github.com/beto-group');

		// --- Account Section ---
		this.accountDetailsEl = this.createSection(containerEl, 'Account', 'Manage your connection.', (content) => {
			this.accountSectionContainer = content;
			this.renderAccountSection();
		});

		// Collapse Account section if logged in
		if (this.plugin.settings.authToken) {
			this.accountDetailsEl.removeAttribute('open');
			this.updateAccountSectionHeader();
		}

		// --- Library Section ---
		this.createSection(containerEl, 'My Library', 'Manage your installed Datacore components.', (content) => {
			// We need to handle the async nature here carefully to avoid double rendering
			// Create a container for the list immediately
			const listContainer = content.createDiv({ cls: 'beto-library-list' });
			// Trigger the load
			this.renderLibrary(listContainer);
		});

		// --- Configuration Section ---
		this.createSection(containerEl, 'Configuration', 'Plugin settings.', (content) => {
			new Setting(content)
				.setName('Download Folder')
				.setDesc('The vault folder where downloaded components will be extracted.')
				.addText(text => text
					.setPlaceholder('DATACORE/Downloads')
					.setValue(this.plugin.settings.downloadFolder)
					.onChange(async (value) => {
						this.plugin.settings.downloadFolder = value;
						await this.plugin.saveSettings();
					}));
		});
	}

	updateAccountSectionHeader() {
		if (!this.accountDetailsEl) return;
		const summary = this.accountDetailsEl.querySelector('summary');
		if (!summary) return;

		// Remove existing email badge if any
		const existingBadge = summary.querySelector('.beto-account-badge');
		if (existingBadge) existingBadge.remove();

		if (this.plugin.settings.authToken && this.userProfile) {
			const badge = summary.createSpan({ cls: 'beto-account-badge' });
			badge.setText(this.userProfile.email);
		}
	}

	renderAccountSection() {
		if (!this.accountSectionContainer) return;
		const content = this.accountSectionContainer;
		content.empty();

		const authStatus = this.plugin.settings.authToken ? 'Active' : 'Not Logged In';
		
		const authSetting = new Setting(content)
			.setName('Connection Status')
			.setDesc(this.userProfile ? `Logged in as: ${this.userProfile.email}` : 'Manage your connection to the Beto Marketplace.')
			.addExtraButton(btn => {
				btn.setIcon(this.plugin.settings.authToken ? 'check-circle' : 'alert-circle')
				   .setTooltip(authStatus)
				   .setDisabled(true);
			});

		authSetting.addButton(button => {
			button.setButtonText(this.plugin.settings.authToken ? 'Disconnect Account' : 'Connect Account');
			
			if (!this.plugin.settings.authToken) {
				button.setCta();
			}

			button.onClick(async () => {
				if (this.plugin.settings.authToken) {
					this.plugin.settings.authToken = null;
					this.userProfile = null;
					await this.plugin.saveSettings();
					this.renderAccountSection(); 
					this.updateAccountSectionHeader();
				} else {
					this.openExternal(`${FRONTEND_URL}/obsidian-connect`);
				}
			});
		});

		if (this.userProfile) {
			const infoDiv = content.createDiv({ cls: 'beto-account-info' });
			infoDiv.createEl('div', { text: `User ID: ${this.userProfile.id}`, cls: 'beto-info-row' });
			infoDiv.createEl('div', { text: `Tier: ${this.userProfile.tier ?? 'Free'}`, cls: 'beto-info-row' });
		}
		
		// Update header whenever we render the section (e.g. after login/logout)
		this.updateAccountSectionHeader();
	}

	createSocialLink(container: HTMLElement, text: string, icon: string, url: string) {
		const link = container.createEl('a', { cls: 'beto-social-link', text: text });
		link.onclick = (e) => {
			e.preventDefault();
			this.openExternal(url);
		};
		// Prepend icon
		const iconSpan = link.createSpan({ cls: 'beto-social-icon' });
		setIcon(iconSpan, icon);
		link.prepend(iconSpan);
	}

	createSection(containerEl: HTMLElement, title: string, desc: string, buildContent: (el: HTMLElement) => void): HTMLDetailsElement {
		const details = containerEl.createEl('details', { cls: 'beto-section-details' });
		details.setAttr('open', ''); // Default open

		const summary = details.createEl('summary', { cls: 'beto-section-summary' });
		const icon = summary.createSpan({ cls: 'beto-section-icon' });
		setIcon(icon, 'chevron-right');
		summary.createSpan({ text: title, cls: 'beto-section-title-text' });

		const content = details.createDiv({ cls: 'beto-section-content' });
		content.createDiv({ cls: 'beto-section-desc', text: desc });

		buildContent(content);
		return details;
	}

	async renderLibrary(container: HTMLElement) {
		container.empty(); // Ensure clean state
		const components = await this.manager.getInstalledComponents();

		if (components.length === 0) {
			const empty = container.createDiv({ cls: 'beto-empty-state' });
			setIcon(empty.createDiv(), 'box');
			empty.createDiv({ text: 'No components installed.' });
			return;
		}

		for (const component of components) {
			new Setting(container)
				.setName(component.name)
				.setDesc(`ID: ${component.id}`)
				.addButton(btn => btn
					.setIcon('trash')
					.setTooltip('Delete Component')
					.onClick(async () => {
						if (confirm(`Are you sure you want to delete ${component.name}?`)) {
							await this.manager.deleteComponent(component.id);
							this.display(); 
						}
					}));
		}
	}
}
