import { useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function CadGenerationForm({
  busy,
  disabled,
  onGenerate,
}: {
  busy: boolean;
  disabled: boolean;
  onGenerate: (input: { title: string; prompt: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextPrompt = prompt.trim();
    if (!nextTitle || !nextPrompt) {
      setError("Add a model title and a bounded CAD request.");
      return;
    }
    setError("");
    await onGenerate({ title: nextTitle, prompt: nextPrompt });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">New model</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Describe one part or assembly. The agent writes source, generates STEP, inspects it, and publishes the evidence.
        </p>
      </div>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="cad-title">Title</FieldLabel>
          <Input
            id="cad-title"
            value={title}
            maxLength={256}
            placeholder="Mounting bracket"
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy || disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cad-prompt">CAD request</FieldLabel>
          <Textarea
            id="cad-prompt"
            value={prompt}
            maxLength={8192}
            rows={6}
            className="min-h-[128px]"
            placeholder="Create a 90° aluminum bracket with two 6 mm mounting holes…"
            onChange={(event) => setPrompt(event.target.value)}
            disabled={busy || disabled}
          />
          <FieldDescription>
            Include units, dimensions, hole sizes, clearances, and any important fit checks.
          </FieldDescription>
          <div className="text-right font-mono text-xs tabular-nums text-muted-foreground">
            {prompt.length} / 8192
          </div>
        </Field>
      </FieldGroup>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={busy || disabled}>
        <Sparkles strokeWidth={1.7} />
        {busy ? "Starting…" : "Generate"}
      </Button>
    </form>
  );
}
