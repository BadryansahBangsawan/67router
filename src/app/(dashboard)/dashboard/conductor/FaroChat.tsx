"use client";

/**
 * Faro chat with voice (Conductor PRD RF4). Text: input → /api/conductor/ask
 * (server-side proxy — the hub credential never reaches the browser). When the
 * answer carries `pending`, Faro is asking for confirmation: the Sim/Não
 * buttons just send "sim"/"não" — the safety gate lives in Faro's engine.
 *
 * Voice input (PRD RF4): push-to-talk → MediaRecorder →
 * POST /api/v1/audio/transcriptions (multipart) → text → /ask → response shown
 * as text. 67router removed the text-to-speech endpoint, so answers are not
 * spoken. The STT model is operator-configurable (provider/model of THIS
 * OmniRoute install), persisted in localStorage.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import Icon from "@/shared/components/Icon";
import Input from "@/shared/components/Input";

interface ChatMessage {
  role: "user" | "faro";
  text: string;
}

type VoiceState = "idle" | "listening" | "thinking";

const STT_KEY = "conductor.sttModel";

function safeGet(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

async function errorMessageOf(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function FaroChat() {
  const t = useTranslations("conductor");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [sttModel, setSttModel] = useState("openai/whisper-1");
  const [err, setErr] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      setSttModel(safeGet(STT_KEY, "openai/whisper-1"));
    })();
  }, []);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const persistSttModel = (stt: string) => {
    setSttModel(stt);
    try {
      localStorage.setItem(STT_KEY, stt);
    } catch {
      // modo privado: segue só em memória
    }
  };

  const send = async (message: string) => {
    const clean = message.trim();
    if (!clean || busy) return;
    setErr("");
    setBusy(true);
    setVoice("thinking");
    setMessages((m) => [...m, { role: "user", text: clean }]);
    setInput("");
    try {
      const res = await fetch("/api/conductor/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean }),
      });
      if (!res.ok) {
        setErr(await errorMessageOf(res, t("faroOffline")));
        return;
      }
      const data = await res.json();
      setMessages((m) => [...m, { role: "faro", text: data.text }]);
      setPending(Boolean(data.pending));
    } catch {
      setErr(t("faroOffline"));
    } finally {
      setBusy(false);
      setVoice((v) => (v === "thinking" ? "idle" : v));
    }
  };

  const startRecording = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setVoice("thinking");
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("model", sttModel);
        form.append("file", new File([blob], "faro-ptt.webm", { type: blob.type }));
        try {
          // multipart: sem header manual — o browser define o boundary
          const res = await fetch("/api/v1/audio/transcriptions", { method: "POST", body: form });
          if (!res.ok) {
            setErr(await errorMessageOf(res, t("sttFailed")));
            setVoice("idle");
            return;
          }
          const data = await res.json();
          if (data.text) await send(data.text);
          else setVoice("idle");
        } catch {
          setErr(t("sttFailed"));
          setVoice("idle");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setVoice("listening");
    } catch {
      setErr(t("micDenied"));
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
  };

  const voiceLabel: Record<VoiceState, string> = {
    idle: t("voiceIdle"),
    listening: t("voiceListening"),
    thinking: t("voiceThinking"),
  };

  return (
    <Card title={t("faroTitle")} subtitle={t("faroSubtitle")}>
      <div className="space-y-3">
        <div ref={logRef} className="max-h-72 overflow-y-auto space-y-2 text-sm">
          {messages.length === 0 && <p className="text-text-muted text-xs">{t("faroEmpty")}</p>}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span
                className={
                  m.role === "user"
                    ? "inline-block rounded px-2 py-1 bg-primary/10"
                    : "inline-block rounded px-2 py-1 bg-bg-subtle whitespace-pre-wrap"
                }
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>

        {err && <Badge variant="error">{err}</Badge>}
        {pending && (
          <div className="flex items-center gap-2">
            <Badge variant="warning" dot>
              {t("faroPending")}
            </Badge>
            <Button variant="primary" size="sm" onClick={() => void send("sim")}>
              {t("yes")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void send("não")}>
              {t("no")}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-48 flex-1"
            aria-label={t("faroPlaceholder")}
            placeholder={t("faroPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send(input);
            }}
            disabled={busy}
          />
          <Button variant="primary" size="sm" onClick={() => void send(input)} disabled={busy}>
            {t("faroSend")}
          </Button>
          <Button
            variant={voice === "listening" ? "danger" : "outline"}
            size="sm"
            title={t("pushToTalk")}
            aria-pressed={voice === "listening"}
            onMouseDown={() => void startRecording()}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={() => void startRecording()}
            onTouchEnd={stopRecording}
          >
            <Icon name="mic" size={14} />
            {voiceLabel[voice]}
          </Button>
        </div>

        <details className="text-xs text-text-muted">
          <summary>{t("voiceModels")}</summary>
          <div className="flex gap-2 pt-2">
            <Input
              className="flex-1"
              label="STT"
              value={sttModel}
              onChange={(e) => persistSttModel(e.target.value)}
            />
          </div>
        </details>
      </div>
    </Card>
  );
}
