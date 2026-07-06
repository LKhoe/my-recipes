"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy } from "lucide-react";

export function GenerateInviteButton() {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const res = await fetch("/api/invite/generate", { method: "POST" });
    setLoading(false);
    if (res.ok) {
      const body = await res.json();
      setCode(body.code);
    } else {
      toast.error("Could not generate an invite code");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={handleGenerate} disabled={loading} className="self-start">
        {loading ? "Generating…" : "Generate invite code"}
      </Button>
      {code && (
        <div className="flex items-center gap-2">
          <Input readOnly value={code} className="max-w-48 font-mono" />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => {
              navigator.clipboard.writeText(code);
              toast.success("Copied");
            }}
            aria-label="Copy invite code"
          >
            <Copy className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
