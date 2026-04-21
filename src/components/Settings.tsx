import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AppSettings = {
  // Appearance
  theme: "dark" | "light" | "auto";
  primaryColor: "blue" | "amber" | "red" | "green" | "purple";
  fontSize: "sm" | "md" | "lg";
  density: "compact" | "normal" | "spacious";

  // Functionality
  autoStream: boolean;
  showSourcesCount: boolean;
  showExecutionTime: boolean;
  enableKeyboardShortcuts: boolean;
  preserveHistory: boolean;
  maxHistoryItems: number;
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  primaryColor: "blue",
  fontSize: "md",
  density: "normal",
  autoStream: true,
  showSourcesCount: true,
  showExecutionTime: true,
  enableKeyboardShortcuts: true,
  preserveHistory: true,
  maxHistoryItems: 50,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const saved = localStorage.getItem("gigabrain.settings");
  return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
}

// Debounced localStorage write to reduce I/O
let settingsSaveTimeout: NodeJS.Timeout | null = null;
export function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;

  // Cancel previous timeout
  if (settingsSaveTimeout) clearTimeout(settingsSaveTimeout);

  // Debounce: wait 500ms before writing to localStorage
  settingsSaveTimeout = setTimeout(() => {
    localStorage.setItem("gigabrain.settings", JSON.stringify(settings));
    applySettings(settings);
    settingsSaveTimeout = null;
  }, 500);

  // Always apply settings immediately for visual feedback
  applySettings(settings);
}

export function applySettings(settings: AppSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const useDark = settings.theme === "dark" || (settings.theme === "auto" && prefersDark);

  root.classList.toggle("dark", useDark);
  root.classList.toggle("light", !useDark);

  // Font size
  root.style.setProperty(
    "--font-size-scale",
    settings.fontSize === "sm" ? "0.9" : settings.fontSize === "lg" ? "1.1" : "1",
  );

  // Density
  root.style.setProperty(
    "--spacing-scale",
    settings.density === "compact" ? "0.8" : settings.density === "spacious" ? "1.2" : "1",
  );

  // Primary color
  const colorMap: Record<string, string> = {
    blue: "oklch(0.66 0.19 252)",
    amber: "oklch(0.78 0.16 79)",
    red: "oklch(0.64 0.22 25)",
    green: "oklch(0.72 0.18 150)",
    purple: "oklch(0.68 0.22 315)",
  };
  root.style.setProperty("--primary", colorMap[settings.primaryColor]);
  root.style.setProperty("--accent", colorMap[settings.primaryColor]);
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange: (settings: AppSettings) => void;
}

export function SettingsDialog({ open, onOpenChange, onSettingsChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  useEffect(() => {
    if (open) {
      setSettings(loadSettings());
    }
  }, [open]);

  const handleSettingChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    onSettingsChange(DEFAULT_SETTINGS);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>SETTINGS</DialogTitle>
          <DialogDescription>
            Customize the appearance and functionality of Giga Brain
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="space-y-6">
            {/* Theme */}
            <div className="space-y-3">
              <Label className="font-display uppercase tracking-widest">Theme</Label>
              <div className="space-y-2">
                {(["dark", "light", "auto"] as const).map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <input
                      type="radio"
                      id={`theme-${t}`}
                      name="theme"
                      value={t}
                      checked={settings.theme === t}
                      onChange={(e) =>
                        handleSettingChange("theme", e.target.value as AppSettings["theme"])
                      }
                      className="h-4 w-4 cursor-pointer"
                    />
                    <Label htmlFor={`theme-${t}`} className="cursor-pointer capitalize font-normal">
                      {t}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Primary Color */}
            <div className="space-y-3">
              <Label className="font-display uppercase tracking-widest">Primary Color</Label>
              <div className="grid grid-cols-5 gap-2">
                {(["blue", "amber", "red", "green", "purple"] as const).map((color) => (
                  <button
                    key={color}
                    onClick={() => handleSettingChange("primaryColor", color)}
                    className={`h-10 rounded border-2 capitalize transition-all ${
                      settings.primaryColor === color
                        ? "border-foreground ring-2 ring-primary"
                        : "border-border"
                    }`}
                    style={{
                      backgroundColor: ["blue", "amber", "red", "green", "purple"].includes(color)
                        ? {
                            blue: "oklch(0.66 0.19 252)",
                            amber: "oklch(0.78 0.16 79)",
                            red: "oklch(0.64 0.22 25)",
                            green: "oklch(0.72 0.18 150)",
                            purple: "oklch(0.68 0.22 315)",
                          }[color]
                        : "transparent",
                    }}
                  >
                    {settings.primaryColor === color && "✓"}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-3">
              <Label className="font-display uppercase tracking-widest">Font Size</Label>
              <div className="flex gap-2">
                {(["sm", "md", "lg"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => handleSettingChange("fontSize", size)}
                    className={`flex-1 rounded border-2 px-3 py-2 font-mono text-[10px] uppercase transition-all ${
                      settings.fontSize === size ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Density */}
            <div className="space-y-3">
              <Label className="font-display uppercase tracking-widest">Spacing</Label>
              <div className="flex gap-2">
                {(["compact", "normal", "spacious"] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => handleSettingChange("density", density)}
                    className={`flex-1 rounded border-2 px-3 py-2 font-mono text-[10px] uppercase transition-all ${
                      settings.density === density
                        ? "border-primary bg-primary/10"
                        : "border-border"
                    }`}
                  >
                    {density}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="behavior" className="space-y-6">
            {/* Auto Stream */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-display uppercase tracking-widest">Auto Stream</Label>
                <p className="mt-1 text-xs text-muted-foreground">Real-time response streaming</p>
              </div>
              <Switch
                checked={settings.autoStream}
                onCheckedChange={(checked) => handleSettingChange("autoStream", checked)}
              />
            </div>

            {/* Show Sources Count */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-display uppercase tracking-widest">Show Sources</Label>
                <p className="mt-1 text-xs text-muted-foreground">Display citation count</p>
              </div>
              <Switch
                checked={settings.showSourcesCount}
                onCheckedChange={(checked) => handleSettingChange("showSourcesCount", checked)}
              />
            </div>

            {/* Show Execution Time */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-display uppercase tracking-widest">Show Timing</Label>
                <p className="mt-1 text-xs text-muted-foreground">Display response duration</p>
              </div>
              <Switch
                checked={settings.showExecutionTime}
                onCheckedChange={(checked) => handleSettingChange("showExecutionTime", checked)}
              />
            </div>

            {/* Enable Keyboard Shortcuts */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-display uppercase tracking-widest">Keyboard Shortcuts</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  ⌘/CTRL+ENTER to execute, / to focus
                </p>
              </div>
              <Switch
                checked={settings.enableKeyboardShortcuts}
                onCheckedChange={(checked) =>
                  handleSettingChange("enableKeyboardShortcuts", checked)
                }
              />
            </div>

            {/* Preserve History */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-display uppercase tracking-widest">Preserve History</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Save session across page reloads
                </p>
              </div>
              <Switch
                checked={settings.preserveHistory}
                onCheckedChange={(checked) => handleSettingChange("preserveHistory", checked)}
              />
            </div>

            {/* Max History Items */}
            {settings.preserveHistory && (
              <div className="space-y-3">
                <Label htmlFor="max-history" className="font-display uppercase tracking-widest">
                  Max History Items
                </Label>
                <input
                  id="max-history"
                  type="number"
                  min="5"
                  max="500"
                  value={settings.maxHistoryItems}
                  onChange={(e) =>
                    handleSettingChange(
                      "maxHistoryItems",
                      Math.max(5, parseInt(e.target.value) || 50),
                    )
                  }
                  className="w-full rounded border-2 border-border bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
            )}
          </TabsContent>

        </Tabs>

        <div className="mt-6 flex items-center justify-between border-t-2 border-border pt-6">
          <button
            onClick={resetSettings}
            className="font-mono text-[10px] tracking-widest text-muted-foreground hover:text-destructive"
          >
            RESET TO DEFAULTS
          </button>
          <Button
            onClick={() => onOpenChange(false)}
            className="brutal-shadow-light bg-primary px-6 text-primary-foreground"
          >
            DONE
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
