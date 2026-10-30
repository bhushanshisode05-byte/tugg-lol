import { useState } from "react";
import { Button } from "@/components/ui/button";
import { imageVisible } from "@/lib/side-image";
import type { Side } from "@/lib/tugg.functions";
export function ReportImage({ side }: { side: Side }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  if (!imageVisible(side)) return null;
  return (
    <div className="mt-1 text-xs">
      <Button
        variant="link"
        size="sm"
        className="h-auto px-0 text-xs text-muted-foreground"
        disabled={busy || status === "Picture reported. Thank you."}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/public/side-images/report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: side.image_id }),
            });
            const data = await r.json();
            setStatus(data.message || data.error || "Could not report picture.");
          } catch {
            setStatus("Could not report picture. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : "Report image"}
      </Button>
      {status && (
        <p role="status" className="mt-1 text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}
