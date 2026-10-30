"use client";

import { useId, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Alert } from "@omniroute/ui-kit/alert";
import { Field } from "@omniroute/ui-kit/field";
import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import Icon from "@/shared/components/Icon";
import Input from "@/shared/components/Input";
import SegmentedControl from "@/shared/components/SegmentedControl";
import Select from "@/shared/components/Select";
import Textarea from "@/shared/components/Textarea";
import { VIDEO_PROVIDERS } from "@omniroute/open-sse/config/videoRegistry.ts";
import { MUSIC_PROVIDERS } from "@omniroute/open-sse/config/musicRegistry.ts";
import { AUDIO_TRANSCRIPTION_PROVIDERS } from "@omniroute/open-sse/config/audioRegistry.ts";
import { toProviderModels, type ProviderModelGroup } from "./mediaProviderModels";

// Image generation and text-to-speech were removed from 67router; only the kept media
// endpoints (video, music, transcription) are offered here.
type Modality = "video" | "music" | "transcription";
type GenerationResult = {
  type: Modality;
  data: any;
  timestamp: number;
};
const VIDEO_PROVIDER_MODELS = toProviderModels(VIDEO_PROVIDERS);
const MUSIC_PROVIDER_MODELS = toProviderModels(MUSIC_PROVIDERS);
const TRANSCRIPTION_PROVIDER_MODELS = toProviderModels(AUDIO_TRANSCRIPTION_PROVIDERS);

const MODALITY_CONFIG: Record<
  Modality,
  {
    icon: string;
    endpoint: string;
    labelKey: string;
    placeholderKey?: string;
  }
> = {
  video: {
    icon: "videocam",
    endpoint: "/api/v1/videos/generations",
    labelKey: "videoGeneration",
    placeholderKey: "videoPromptPlaceholder",
  },
  music: {
    icon: "music_note",
    endpoint: "/api/v1/music/generations",
    labelKey: "musicGeneration",
    placeholderKey: "musicPromptPlaceholder",
  },
  transcription: {
    icon: "mic",
    endpoint: "/api/v1/audio/transcriptions",
    labelKey: "transcription",
    placeholderKey: "transcriptionPlaceholder",
  },
};

// Provider+model registry derived from runtime registries to avoid dashboard drift
const PROVIDER_MODELS: Record<Modality, ProviderModelGroup[]> = {
  video: VIDEO_PROVIDER_MODELS,
  music: MUSIC_PROVIDER_MODELS,
  transcription: TRANSCRIPTION_PROVIDER_MODELS,
};
const INITIAL_PROVIDER = PROVIDER_MODELS.video[0];
const INITIAL_MODEL = INITIAL_PROVIDER?.models[0];

/** Parse a human-readable error from the API error response */
function parseApiError(
  raw: any,
  statusCode: number,
  fallbackMessage: string
): { message: string; isCredentials: boolean } {
  const readErrorMessage = (value: any): string | null => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const messages = value
        .map((entry: any) => readErrorMessage(entry))
        .filter((entry: string | null): entry is string => Boolean(entry));
      if (messages.length > 0) return messages.join(", ");
      return null;
    }
    if (typeof value.message === "string") return value.message;
    if (typeof value.detail === "string") return value.detail;
    if (Array.isArray(value.errors)) {
      const messages = value.errors
        .map((entry: any) => readErrorMessage(entry))
        .filter((entry: string | null): entry is string => Boolean(entry));
      if (messages.length > 0) return messages.join(", ");
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  };

  const msg =
    readErrorMessage(raw?.error) ||
    readErrorMessage(raw?.errors) ||
    raw?.err_msg ||
    raw?.message ||
    raw?.detail ||
    (typeof raw === "string" ? raw : null) ||
    fallbackMessage;

  const isCredentials =
    typeof msg === "string" &&
    // eslint-disable-next-line no-restricted-syntax -- teknik string kontrolü, kullanıcı metni araması değil
    (msg.toLowerCase().includes("no credentials") ||
      // eslint-disable-next-line no-restricted-syntax -- teknik string kontrolü, kullanıcı metni araması değil
      msg.toLowerCase().includes("invalid api key") ||
      // eslint-disable-next-line no-restricted-syntax -- teknik string kontrolü, kullanıcı metni araması değil
      msg.toLowerCase().includes("unauthorized") ||
      // eslint-disable-next-line no-restricted-syntax -- teknik string kontrolü, kullanıcı metni araması değil
      msg.toLowerCase().includes("authentication") ||
      // eslint-disable-next-line no-restricted-syntax -- teknik string kontrolü, kullanıcı metni araması değil
      msg.toLowerCase().includes("api key") ||
      statusCode === 401 ||
      statusCode === 403);

  return { message: String(msg), isCredentials };
}

/** Format file size to human-readable string */
// Native file pickers keep the browser's button; style it with the kit tokens.
const FILE_INPUT_CLASS =
  "file:mr-3 file:rounded file:border-0 file:bg-bg-subtle file:px-3 file:py-1 file:text-sm file:text-text-main";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function MediaPageClient() {
  const t = useTranslations("media");
  const tc = useTranslations("common");
  const [activeTab, setActiveTab] = useState<Modality>("video");
  const [prompt, setPrompt] = useState("");

  // Selected provider and model per modality
  const [selectedProvider, setSelectedProvider] = useState<string>(INITIAL_PROVIDER?.id ?? "");
  const [selectedModel, setSelectedModel] = useState<string>(INITIAL_MODEL?.id ?? "");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCredentialsError, setIsCredentialsError] = useState(false);

  // Transcription-specific
  const MAX_TRANSCRIPTION_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB
  const promptId = useId();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);

  // Fix #390: Track which local providers (sdwebui, comfyui) are actually configured
  // so we can hide them when they haven't been set up in the providers page
  const LOCAL_PROVIDERS = ["sdwebui", "comfyui"];
  const [configuredLocalProviders, setConfiguredLocalProviders] = useState<Set<string>>(
    new Set(LOCAL_PROVIDERS) // Optimistic: show all until we know otherwise
  );

  useEffect(() => {
    // Fetch configured provider connections to determine which local providers are set up
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data) => {
        const connections: { provider?: string; testStatus?: string }[] = Array.isArray(data)
          ? data
          : (data?.connections ?? data?.providers ?? []);
        const configured = new Set<string>();
        for (const conn of connections) {
          const pId = conn?.provider;
          if (pId && LOCAL_PROVIDERS.includes(pId)) {
            configured.add(pId);
          }
        }
        // Only update if at least one local provider was found, otherwise keep optimistic
        if (configured.size > 0) {
          setConfiguredLocalProviders(configured);
        } else {
          // No local providers configured — hide sdwebui/comfyui
          setConfiguredLocalProviders(new Set());
        }
      })
      .catch(() => {
        // On error, keep showing all (fail-open)
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter out unconfigured local providers from the provider list
  const currentProviders = (PROVIDER_MODELS[activeTab] ?? []).filter(
    (p) => !LOCAL_PROVIDERS.includes(p.id) || configuredLocalProviders.has(p.id)
  );
  const currentModels = currentProviders.find((p) => p.id === selectedProvider)?.models ?? [];

  const switchTab = (tab: Modality) => {
    setActiveTab(tab);
    setPrompt("");
    setResult(null);
    setError(null);
    setIsCredentialsError(false);
    setAudioFile(null);
    // Pick first provider and first model automatically
    const providers = PROVIDER_MODELS[tab] ?? [];
    const firstProvider = providers[0];
    setSelectedProvider(firstProvider?.id ?? "");
    const firstModel = firstProvider?.models[0]?.id ?? "";
    setSelectedModel(firstModel);
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    const models = PROVIDER_MODELS[activeTab]?.find((p) => p.id === providerId)?.models ?? [];
    const firstModel = models[0]?.id ?? "";
    setSelectedModel(firstModel);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setIsCredentialsError(false);
    setResult(null);

    try {
      const config = MODALITY_CONFIG[activeTab];
      const modelId = selectedModel;
      const promptValue = prompt.trim();

      if (activeTab === "transcription") {
        if (!audioFile) {
          setError(t("selectAudioToTranscribe"));
          setLoading(false);
          return;
        }
        const form = new FormData();
        form.append("file", audioFile);
        form.append("model", modelId);
        const res = await fetch(config.endpoint, { method: "POST", body: form });
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}));
          const { message, isCredentials } = parseApiError(
            raw,
            res.status,
            t("requestFailed", { status: res.status })
          );
          setIsCredentialsError(isCredentials);
          throw new Error(message);
        }
        const data = await res.json();
        // Check for noSpeechDetected flag (music, silence, etc.) — NOT a credential error
        if (data?.noSpeechDetected) {
          setError(t("noSpeechDetected", { provider: selectedProvider }));
          setIsCredentialsError(false);
          setLoading(false);
          return;
        }
        // Warn if text is empty without the noSpeechDetected flag (unexpected)
        if (data && typeof data.text === "string" && data.text.trim() === "") {
          setError(t("emptyTranscription", { provider: selectedProvider }));
          // Only mark as credential error if we can confirm it from context
          setIsCredentialsError(false);
          setLoading(false);
          return;
        }
        setResult({ type: "transcription", data, timestamp: Date.now() });
        setLoading(false);
        return;
      }

      if (!promptValue) {
        setError(t("enterPrompt"));
        setLoading(false);
        return;
      }

      const payload: Record<string, unknown> = { model: modelId, prompt: promptValue };

      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}));
        const { message, isCredentials } = parseApiError(
          raw,
          res.status,
          t("requestFailed", { status: res.status })
        );
        setIsCredentialsError(isCredentials);
        throw new Error(message);
      }
      const data = await res.json();
      setResult({ type: activeTab, data, timestamp: Date.now() });
    } catch (err: any) {
      setError(err.message || t("generationFailed"));
    }
    setLoading(false);
  };

  const config = MODALITY_CONFIG[activeTab];
  const isGenerateDisabled =
    loading || (activeTab === "transcription" ? !audioFile : !prompt.trim());

  return (
    <div className="space-y-6">
      {/* Modality Tabs */}
      <SegmentedControl
        aria-label={t("modalityTabsAria")}
        value={activeTab}
        onChange={(next) => switchTab(next as Modality)}
        options={(Object.keys(MODALITY_CONFIG) as Modality[]).map((key) => ({
          value: key,
          label: t(MODALITY_CONFIG[key].labelKey),
          icon: MODALITY_CONFIG[key].icon,
        }))}
      />

      {/* Generation Form */}
      <Card className="space-y-4" padding="md">
        {/* Provider + Model row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={t("provider")}
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            options={currentProviders.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Select
            label={t("model")}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            options={currentModels.map((m) => ({ value: m.id, label: m.name }))}
          />
        </div>

        {/* Credential hint */}
        {selectedProvider && !["sdwebui", "comfyui", "qwen"].includes(selectedProvider) && (
          <p className="text-xs text-text-muted flex items-center gap-1.5">
            <Icon name="info" size={14} className="text-warning" />
            {t.rich("credentialsRequired", {
              provider: () => <strong className="capitalize">{selectedProvider}</strong>,
              providers: (chunks) => (
                <Link
                  href="/dashboard/providers"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}

        {/* Transcription: file upload */}
        {activeTab === "transcription" ? (
          <Input
            type="file"
            accept="audio/*,video/*"
            label={t("audioVideoFile")}
            error={fileSizeError || undefined}
            hint={
              <>
                {audioFile && !fileSizeError && (
                  <span className="block">
                    {audioFile.name} ({formatFileSize(audioFile.size)})
                  </span>
                )}
                <span className="block">{t("audioVideoFileHint")}</span>
              </>
            }
            inputClassName={FILE_INPUT_CLASS}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setFileSizeError(null);
              if (file && file.size > MAX_TRANSCRIPTION_FILE_SIZE) {
                setFileSizeError(
                  t("fileTooLarge", { size: formatFileSize(file.size), max: "4 GB" })
                );
                setAudioFile(null);
                e.target.value = "";
                return;
              }
              setAudioFile(file);
            }}
          />
        ) : (
          <>
            {/* Prompt / Text */}
            <Field htmlFor={promptId} label={t("prompt")}>
              <Textarea
                id={promptId}
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={config.placeholderKey ? t(config.placeholderKey) : undefined}
                className="resize-none"
              />
            </Field>
          </>
        )}

        {/* Generate button */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleGenerate}
          disabled={isGenerateDisabled}
          loading={loading}
          icon={loading ? undefined : activeTab === "transcription" ? "mic" : "auto_awesome"}
        >
          {loading
            ? activeTab === "transcription"
              ? t("transcribing")
              : t("generating")
            : activeTab === "transcription"
              ? t("transcribeAudio")
              : t("generateModality", { modality: t(config.labelKey) })}
        </Button>
      </Card>

      {/* Error */}
      {error && (
        <Alert
          variant={isCredentialsError ? "warning" : "critical"}
          icon={<Icon name={isCredentialsError ? "key" : "error"} size={20} />}
          title={isCredentialsError ? t("apiKeyRequired") : t("error")}
          description={<span className="break-words">{error}</span>}
          dismissLabel={tc("dismissNotification")}
          onDismiss={() => setError(null)}
          actions={
            isCredentialsError ? (
              <Link
                href="/dashboard/providers"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Icon name="open_in_new" size={13} />
                {t("configureApiKeys")} →
              </Link>
            ) : undefined
          }
        />
      )}

      {/* Result */}
      {result && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-4">
            <Icon name={config.icon} size={20} className="text-primary" />
            <h3 className="text-sm font-medium text-text-main">{t("result")}</h3>
            <span className="text-xs text-text-muted ml-auto">
              {new Date(result.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {result.type === "transcription" ? (
            <div className="space-y-3">
              <div className="bg-bg-subtle rounded-lg p-4 text-sm text-text-main leading-relaxed whitespace-pre-wrap">
                {result.data?.text || (
                  <span className="text-text-muted italic">{t("noTextReturned")}</span>
                )}
              </div>
              {result.data?.words && (
                <details className="mt-2">
                  <summary className="text-xs text-text-muted cursor-pointer hover:text-text-main">
                    {t("wordTimestamps", { count: result.data.words.length })}
                  </summary>
                  <pre className="bg-bg-subtle rounded mt-2 p-3 text-xs text-text-muted overflow-auto max-h-48 custom-scrollbar">
                    {JSON.stringify(result.data.words, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <pre className="bg-bg-subtle rounded-lg p-4 text-xs text-text-muted overflow-auto max-h-96 custom-scrollbar">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </Card>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(MODALITY_CONFIG) as Modality[]).map((key) => {
          const cfg = MODALITY_CONFIG[key];
          const providerCount = PROVIDER_MODELS[key]?.length ?? 0;
          return (
            <Card key={key} padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center size-8 rounded-lg bg-bg-subtle text-primary">
                  <Icon name={cfg.icon} size={16} />
                </div>
                <span className="text-sm font-medium text-text-main">{t(cfg.labelKey)}</span>
              </div>
              <p className="text-xs text-text-muted">
                {t("providerCount", { count: providerCount })}
              </p>
              <code className="block mt-2 break-all text-xs text-text-muted bg-bg-subtle rounded px-2 py-1">
                POST {cfg.endpoint}
              </code>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
