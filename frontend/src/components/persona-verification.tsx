"use client";

/**
 * PersonaVerification — embeds the Persona identity verification flow inline
 * using the official Persona JS client SDK.
 *
 * The SDK is loaded as a static script (public/_persona/persona.js) to avoid
 * Next.js/webpack chunk-loading issues with UMD bundles.
 *
 * The Client creates its own postMessage-based overlay, so it works without
 * any iframe allowlisting in the Persona dashboard, and the browser grants
 * camera/mic permissions natively.
 */

import { useEffect, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PersonaClient = {
  open: () => void;
  cancel: (force: boolean) => void;
  destroy: () => void;
};

interface Props {
  inquiryId: string;
  sessionToken?: string;
  environment?: "sandbox" | "production";
  onComplete: (inquiryId: string, status: string) => void;
  onCancel: () => void;
  onError?: (error: unknown) => void;
}

const PERSONA_SCRIPT_SRC = "/_persona/persona.js";

function loadPersonaScript(): Promise<void> {
  // Already loaded
  if ((window as any).Persona) return Promise.resolve();
  // Already injected but not yet ready
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${PERSONA_SCRIPT_SRC}"]`
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PERSONA_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function PersonaVerification({
  inquiryId,
  sessionToken,
  environment = "sandbox",
  onComplete,
  onCancel,
  onError,
}: Props) {
  const clientRef = useRef<PersonaClient | null>(null);

  // Keep stable callback refs so the effect doesn't re-run on re-renders
  const onCompleteRef = useRef(onComplete);
  const onCancelRef   = useRef(onCancel);
  const onErrorRef    = useRef(onError);
  onCompleteRef.current = onComplete;
  onCancelRef.current   = onCancel;
  onErrorRef.current    = onError;

  useEffect(() => {
    let destroyed = false;

    loadPersonaScript()
      .then(() => {
        if (destroyed) return;
        const { Client } = (window as any).Persona as {
          Client: new (opts: Record<string, unknown>) => PersonaClient;
        };

        const client = new Client({
          inquiryId,
          ...(sessionToken ? { sessionToken } : {}),
          environment,
          onReady: () => client.open(),
          onComplete: ({ inquiryId: id, status }: { inquiryId: string; status: string }) => {
            onCompleteRef.current(id, status);
          },
          onCancel: () => {
            if (!destroyed) onCancelRef.current();
          },
          onError: (err: unknown) => {
            onErrorRef.current?.(err);
          },
        });

        clientRef.current = client;
      })
      .catch((err) => {
        if (!destroyed) onErrorRef.current?.(err);
      });

    return () => {
      destroyed = true;
      try { clientRef.current?.cancel(true); } catch { /* ignore */ }
      try { clientRef.current?.destroy();    } catch { /* ignore */ }
      clientRef.current = null;
    };
  // Re-run only when the inquiry changes (new attempt / new reset)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId, sessionToken]);

  // The SDK renders its own full-screen overlay.
  // Show a brief loading indicator while the client initialises (~1 s).
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
        <p className="text-base font-medium text-gray-700">Loading identity verification…</p>
        <p className="text-sm text-gray-400">
          Please allow camera and microphone access when prompted.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
