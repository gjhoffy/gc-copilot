import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem("gigabrain.settings", JSON.stringify(settings));
  applySettings(settings);
}

export function applySettings(settings: AppSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Theme
  if (settings.theme === "dark" || (settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Font size
  root.style.setProperty("--font-size-scale", 
    settings.fontSize === "sm" ? "0.9" : settings.fontSize === "lg" ? "1.1" : "1");

  // Density
  root.style.setProperty("--spacing-scale",
    settings.density === "compact" ? "0.8" : settings.density === "spacious" ? "1.2" : "1");

  // Primary color
  const colorMap: Record<string, string> = {
    blue: "hsl(217, 91%, 60%)",
    amber: "hsl(45, 93%, 47%)",
    red: "hsl(0, 84%, 60%)",
    green: "hsl(142, 71%, 45%)",
    purple: "hsl(280, 85%, 55%)",
  };
  root.style.setProperty("--primary", colorMap[settings.primaryColor]);
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  const handleSettingChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
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
                {(['dark', 'light', 'auto'] as const).map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <input
                      type="radio"
                      id={`theme-${t}`}
                      name="theme"
                      value={t}
                      checked={settings.theme === t}
                      onChange={(e) => handleSettingChange('theme', e.target.value as AppSettings['theme'])}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <Label htmlFor={`theme-${t}`} className="cursor-pointer capitalize font-normal">{t}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Primary Color */}
            <div className="space-y-3">
              <Label className="font-display uppercase tracking-widest">Primary Color</Label>
              <div className="grid grid-cols-5 gap-2">
                {(['blue', 'amber', 'red', 'green', 'purple'] as const).map((color) => (
                  <button
                    key={color}
                    onClick={() => handleSettingChange('primaryColor', color)}
                    className={`h-10 rounded border-2 capitalize transition-all ${
                      settings.primaryColor === color
                        ? 'border-foreground ring-2 ring-primary'
                        : 'border-border'
                    }`}
                    style={{
                      backgroundColor: ['blue', 'amber', 'red', 'green', 'purple'].includes(color)
                        ? { blue: 'hsl(217, 91%, 60%)', amber: 'hsl(45, 93%, 47%)', red: 'hsl(0, 84%, 60%)', green: 'hsl(142, 71%, 45%)', purple: 'hsl(280, 85%, 55%)' }[color]
                        : 'transparent'
                    }}
                  >
                    {settings.primaryColor === color && '✓'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-3">
              <Label className="font-display uppercase tracking-widest">Font Size</Label>
              <div className="flex gap-2">
                {(['sm', 'md', 'lg'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => handleSettingChange('fontSize', size)}
                    className={`flex-1 rounded border-2 px-3 py-2 font-mono text-[10px] uppercase transition-all ${
                      settings.fontSize === size
                        ? 'border-primary bg-primary/10'
                        : 'border-border'
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
                {(['compact', 'normal', 'spacious'] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => handleSettingChange('density', density)}
                    className={`flex-1 rounded border-2 px-3 py-2 font-mono text-[10px] uppercase transition-all ${
                      settings.density === density
                        ? 'border-primary bg-primary/10'
                        : 'border-border'
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
                onCheckedChange={(checked) => handleSettingChange('autoStream', checked)}
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
                onCheckedChange={(checked) => handleSettingChange('showSourcesCount', checked)}
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
                onCheckedChange={(checked) => handleSettingChange('showExecutionTime', checked)}
              />
            </div>

            {/* Enable Keyboard Shortcuts */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-display uppercase tracking-widest">Keyboard Shortcuts</Label>
                <p className="mt-1 text-xs text-muted-foreground">⌘/CTRL+ENTER to execute, / to focus</p>
              </div>
              <Switch
                checked={settings.enableKeyboardShortcuts}
                onCheckedChange={(checked) => handleSettingChange('enableKeyboardShortcuts', checked)}
              />
            </div>

            {/* Preserve History */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-display uppercase tracking-widest">Preserve History</Label>
                <p className="mt-1 text-xs text-muted-foreground">Save session across page reloads</p>
              </div>
              <Switch
                checked={settings.preserveHistory}
                onCheckedChange={(checked) => handleSettingChange('preserveHistory', checked)}
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
                  onChange={(e) => handleSettingChange('maxHistoryItems', Math.max(5, parseInt(e.target.value) || 50))}
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
