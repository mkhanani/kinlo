import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useHasKey, useModels, useSaveKey } from "@/ai/hooks";
import { cleanBaseUrl, explainError, PROVIDER_IDS, PROVIDERS } from "@/ai/providers";
import { useSaveSetting, useSettings } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { SettingRow as Row } from "@/components/ui/SettingRow";
import type { AiProvider } from "@/data/settings";
import { openExternal } from "@/lib/external";

/**
 * Connecting a model. The provider, model and address are ordinary settings. The key is
 * not: it goes to the system keychain and is never shown again once saved.
 */
export function AssistantSettings() {
  const { aiProvider: provider, aiModel, aiBaseUrl } = useSettings();
  const save = useSaveSetting();
  const info = provider ? PROVIDERS[provider] : null;
  const hasKey = useHasKey(provider);
  const ready = info !== null && (!info.needsKey || hasKey.data === true);
  const models = useModels(provider, aiBaseUrl, ready);

  const choose = (next: AiProvider | null) => {
    if (next === provider) return;
    // A model name and an address belong to one provider, so they do not carry over.
    save("aiProvider", next);
    save("aiModel", null);
    save("aiBaseUrl", null);
  };

  return (
    <section id="assistant" aria-label="Assistant settings">
      <h2 className="mb-2 mt-8 px-1 text-sm font-medium tracking-normal text-muted">Assistant</h2>
      <div className="glass divide-y divide-hairline">
        <Row label="Model provider" hint="Bring your own key. kinlo has no account and no server of its own.">
          <Select
            aria-label="Model provider"
            value={provider ?? ""}
            onChange={(e) => choose((e.target.value || null) as AiProvider | null)}
            className="!w-[220px]"
          >
            <option value="">Not connected</option>
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
                {PROVIDERS[id].local ? " (on this computer)" : ""}
              </option>
            ))}
          </Select>
        </Row>

        {provider && info?.needsKey && <KeyRow provider={provider} saved={hasKey.data === true} />}

        {provider && info?.customBaseUrl && (
          <AddressRow key={provider} provider={provider} value={aiBaseUrl} onSave={(value) => save("aiBaseUrl", value)} />
        )}

        {provider && ready && (
          <Row
            label="Model"
            hint={
              models.isPending
                ? "Checking which models you can use."
                : models.isError
                  ? `${explainError(models.error, provider)} You can still type a model name.`
                  : models.data.length
                    ? "Pick one from the list, or type its name."
                    : info?.local
                      ? "Ollama has no models yet. Pull one with Ollama, then come back."
                      : "Type the name of the model to use."
            }
          >
            <ModelField
              key={provider}
              value={aiModel}
              options={models.data ?? []}
              onSave={(value) => save("aiModel", value)}
            />
          </Row>
        )}
      </div>
      <p className="mt-2 px-1 text-sm text-muted">
        {!info
          ? "The assistant is optional. Everything else in kinlo works without it."
          : info.local
            ? "Ollama runs on this computer, so nothing you ask leaves it."
            : `When you ask the assistant something, your question and the details of the people it looks up are sent to ${
                cleanBaseUrl(aiBaseUrl) ? "the service at the address above" : info.label
              }. Nothing else leaves this computer.`}
      </p>
    </section>
  );
}

function KeyRow({ provider, saved }: { provider: AiProvider; saved: boolean }) {
  const info = PROVIDERS[provider];
  const saveKey = useSaveKey();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setValue("");
    setEditing(false);
  }, [provider]);

  const submit = () => {
    if (!value.trim()) return;
    saveKey.mutate(
      { provider, key: value },
      {
        onSuccess: () => {
          setValue("");
          setEditing(false);
        },
      },
    );
  };
  const failed = saveKey.isError
    ? saveKey.error instanceof Error
      ? saveKey.error.message
      : String(saveKey.error)
    : null;

  return (
    <Row
      label="API key"
      hint={
        failed ? (
          <span className="text-danger">{failed}</span>
        ) : saved && !editing ? (
          "Saved in your system's keychain. kinlo does not show it again."
        ) : (
          <>
            Kept in your system's keychain, never in kinlo's own files.{" "}
            {info.keyUrl && (
              <button className="underline underline-offset-2 hover:text-fg" onClick={() => void openExternal(info.keyUrl!)}>
                Get a key from {info.label}
              </button>
            )}
          </>
        )
      }
    >
      {saved && !editing ? (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setEditing(true)}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" onClick={() => saveKey.mutate({ provider, key: null })}>
            Remove
          </Button>
        </div>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            aria-label="API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste your key"
            className="!w-[220px]"
          />
          <Button size="md" variant="primary" type="submit" disabled={!value.trim() || saveKey.isPending}>
            Save
          </Button>
          {saved && (
            <Button size="md" variant="ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </form>
      )}
    </Row>
  );
}

function AddressRow({
  provider,
  value,
  onSave,
}: {
  provider: AiProvider;
  value: string | null;
  onSave: (value: string | null) => void;
}) {
  const info = PROVIDERS[provider];
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const invalid = draft.trim() !== "" && cleanBaseUrl(draft) === null;

  return (
    <Row
      label="Address"
      hint={
        invalid
          ? "That is not a web address. It should start with http:// or https://."
          : info.local
            ? "Where Ollama is running. Leave empty for this computer."
            : "Only for another service that works like OpenAI's. Leave empty for OpenAI itself."
      }
    >
      <Input
        aria-label="Address"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (invalid) return;
          const cleaned = cleanBaseUrl(draft);
          if (cleaned !== (value ?? null)) onSave(cleaned);
        }}
        placeholder={info.defaultBaseUrl}
        className="!w-[300px]"
      />
    </Row>
  );
}

/** A model name: typed freely, or picked from what the provider offers. */
function ModelField({
  value,
  options,
  onSave,
}: {
  value: string | null;
  options: string[];
  onSave: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = (next: string) => {
    const cleaned = next.trim() || null;
    if (cleaned !== (value ?? null)) onSave(cleaned);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="Model"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => e.key === "Enter" && commit(draft)}
        placeholder="Model name"
        className="!w-[260px]"
      />
      {options.length > 0 && (
        <Menu
          trigger={
            <Button aria-label="Choose a model" className="!w-8 !px-0">
              <ChevronDown size={15} strokeWidth={1.5} />
            </Button>
          }
        >
          {options.map((option) => (
            <MenuItem
              key={option}
              checked={option === value}
              onSelect={() => {
                setDraft(option);
                commit(option);
              }}
            >
              {option}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  );
}
