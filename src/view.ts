import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import { ComponentManager, InstalledComponent } from "./manager";
import { BetoMarketplaceSettings } from "./settings";

export const VIEW_TYPE_BETO_MARKETPLACE = "beto-marketplace-view";

export class BetoMarketplaceView extends ItemView {
  manager: ComponentManager;
  settings: BetoMarketplaceSettings;

  constructor(leaf: WorkspaceLeaf, manager: ComponentManager, settings: BetoMarketplaceSettings) {
    super(leaf);
    this.manager = manager;
    this.settings = settings;
  }

  getViewType() {
    return VIEW_TYPE_BETO_MARKETPLACE;
  }

  getDisplayText() {
    return "Beto Marketplace";
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
    container.addClass("beto-marketplace-container");

    // Header
    const header = container.createDiv({ cls: "beto-header" });
    header.createEl("h1", { text: "Datacore Manager" });
    
    // Tabs (Simple implementation)
    const tabsContainer = container.createDiv({ cls: "beto-tabs" });
    const libraryTab = tabsContainer.createEl("button", { text: "My Library", cls: "beto-tab active" });
    // const storeTab = tabsContainer.createEl("button", { text: "Browse Store", cls: "beto-tab" }); // Future

    // Content Area
    const contentArea = container.createDiv({ cls: "beto-content" });
    
    await this.renderLibrary(contentArea);
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
