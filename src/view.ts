import { ItemView, WorkspaceLeaf, setIcon, Notice, ButtonComponent } from "obsidian";
import { ComponentManager } from "./manager";
import { BetoNexusSettings } from "./settings";

// Interface for the API passed from main.ts
export interface BetoNexusAPI {
    getUser(): Promise<any | null>;
    login(code: string): Promise<boolean>;
    logout(): void;
}

export const VIEW_TYPE_BETO_NEXUS = "beto-nexus-view";

export class BetoNexusView extends ItemView {
  manager: ComponentManager;
  settings: BetoNexusSettings;
  api: BetoNexusAPI;
  openSettings: () => void;
  activeTab: 'dashboard' | 'library' = 'dashboard';

  constructor(leaf: WorkspaceLeaf, manager: ComponentManager, settings: BetoNexusSettings, api: BetoNexusAPI, openSettings: () => void) {
    super(leaf);
    this.manager = manager;
    this.settings = settings;
    this.api = api;
    this.openSettings = openSettings;
  }

  getViewType() {
    return VIEW_TYPE_BETO_NEXUS;
  }

  getDisplayText() {
    return "Beto Nexus";
  }

  getIcon() {
    return "box";
  }

  async onOpen() {
    this.render();
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("beto-nexus-container");

    // Header
    const header = container.createDiv({ cls: "beto-header" });
    const title = header.createDiv({ cls: "beto-title" });
    setIcon(title.createSpan({ cls: "beto-logo" }), "box");
    title.createEl("h1", { text: "Beto Nexus" });

    // Spacer
    header.createDiv({ cls: "beto-spacer" }).style.flex = "1";

    // Settings Button
    const settingsBtn = header.createEl("button", { cls: "clickable-icon beto-settings-btn" });
    setIcon(settingsBtn, "settings");
    settingsBtn.setAttr("aria-label", "Open Settings");
    settingsBtn.onclick = () => this.openSettings();

    // Tabs
    const tabsContainer = container.createDiv({ cls: "beto-tabs" });
    
    const dashboardTab = tabsContainer.createEl("button", { 
        text: "Dashboard", 
        cls: `beto-tab ${this.activeTab === 'dashboard' ? 'active' : ''}` 
    });
    dashboardTab.onclick = () => { this.activeTab = 'dashboard'; this.render(); };

    const libraryTab = tabsContainer.createEl("button", { 
        text: "My Library", 
        cls: `beto-tab ${this.activeTab === 'library' ? 'active' : ''}` 
    });
    libraryTab.onclick = () => { this.activeTab = 'library'; this.render(); };

    // Content Area
    const contentArea = container.createDiv({ cls: "beto-content" });
    
    if (this.activeTab === 'dashboard') {
        await this.renderDashboard(contentArea);
    } else {
        await this.renderLibrary(contentArea);
    }
  }

  async renderDashboard(container: HTMLElement) {
    container.empty();
    container.addClass("beto-dashboard");

    const user = await this.api.getUser();

    // User Card
    const userCard = container.createDiv({ cls: "beto-card user-card" });
    
    if (user) {
        const header = userCard.createDiv({ cls: "card-header" });
        const avatar = header.createDiv({ cls: "user-avatar" });
        avatar.setText(user.name ? user.name.charAt(0).toUpperCase() : "U");
        
        const info = header.createDiv({ cls: "user-info" });
        info.createEl("h2", { text: user.name || "User" });
        info.createEl("span", { text: user.email || "", cls: "user-email" });
        
        const badge = info.createDiv({ cls: "user-badge" });
        badge.setText(user.tier || "Free Plan");

        const actions = userCard.createDiv({ cls: "card-actions" });
        new ButtonComponent(actions)
            .setButtonText("Manage Account")
            .onClick(() => {
                window.open("https://beto.app/account", "_blank");
            });
            
        new ButtonComponent(actions)
            .setButtonText("Log Out")
            .onClick(() => {
                this.api.logout();
                this.render();
            });

    } else {
        userCard.addClass("not-logged-in");
        userCard.createEl("h2", { text: "Welcome to Beto Nexus" });
        userCard.createEl("p", { text: "Please log in via Settings to access premium components and sync your settings." });
        
        new ButtonComponent(userCard)
            .setButtonText("Open Settings")
            .setCta()
            .onClick(() => {
                this.openSettings();
            });
    }

    // Quick Links / News
    const linksGrid = container.createDiv({ cls: "links-grid" });
    
    const marketplaceLink = linksGrid.createDiv({ cls: "beto-card link-card" });
    setIcon(marketplaceLink.createDiv({ cls: "card-icon" }), "shopping-bag");
    marketplaceLink.createEl("h3", { text: "Marketplace" });
    marketplaceLink.createEl("p", { text: "Discover new components and plugins." });
    marketplaceLink.onclick = () => window.open("https://beto.app/marketplace", "_blank");

    const docsLink = linksGrid.createDiv({ cls: "beto-card link-card" });
    setIcon(docsLink.createDiv({ cls: "card-icon" }), "book-open");
    docsLink.createEl("h3", { text: "Documentation" });
    docsLink.createEl("p", { text: "Learn how to build and use components." });
    docsLink.onclick = () => window.open("https://docs.beto.app", "_blank");
  }

  async renderLibrary(container: HTMLElement) {
    container.empty();
    const components = await this.manager.getInstalledComponents();

    if (components.length === 0) {
      const emptyState = container.createDiv({ cls: "beto-empty-state" });
      setIcon(emptyState.createDiv(), "box");
      emptyState.createEl("p", { text: "No components installed yet." });
      return;
    }

    const grid = container.createDiv({ cls: "beto-component-grid" });

    for (const component of components) {
      const card = grid.createDiv({ cls: "beto-card" });
      
      // Icon/Thumbnail
      const iconDiv = card.createDiv({ cls: "beto-card-icon" });
      setIcon(iconDiv, "package");

      // Info
      const infoDiv = card.createDiv({ cls: "beto-card-info" });
      infoDiv.createEl("h3", { text: component.name });
      infoDiv.createEl("span", { text: `ID: ${component.id}`, cls: "beto-card-meta" });

      // Actions
      const actionsDiv = card.createDiv({ cls: "beto-card-actions" });
      
      const deleteBtn = actionsDiv.createEl("button", { cls: "mod-warning" });
      setIcon(deleteBtn, "trash");
      deleteBtn.setAttr("aria-label", "Delete");
      deleteBtn.onclick = async () => {
        if (confirm(`Are you sure you want to delete ${component.name}?`)) {
            await this.manager.deleteComponent(component.id);
            await this.renderLibrary(container); // Refresh
        }
      };
    }
  }

  async onClose() {
    // Cleanup
  }
}
