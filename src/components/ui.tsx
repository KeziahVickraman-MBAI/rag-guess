import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
  secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:text-slate-300",
};

export function Button({ variant = "secondary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";

export function Section({ step, title, children, right }: { step: number | string; title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby={`step-${step}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`step-${step}`} className="text-lg font-semibold text-slate-900">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm text-white">{step}</span>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function TextField({ label, value, onChange, multiline = false, rows = 2, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; rows?: number; placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {multiline ? (
        <textarea id={id} rows={rows} className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function RowControls({ index, length, onMove, onRemove, label }: {
  index: number; length: number; onMove: (to: number) => void; onRemove: () => void; label: string;
}) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <Button variant="ghost" className="px-1.5" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>↑</Button>
      <Button variant="ghost" className="px-1.5" aria-label={`Move ${label} down`} disabled={index === length - 1} onClick={() => onMove(index + 1)}>↓</Button>
      <Button variant="ghost" className="px-1.5 hover:text-red-600" aria-label={`Remove ${label}`} onClick={onRemove}>✕</Button>
    </div>
  );
}

/** Editable list of strings with add / remove / reorder. */
export function StringList({ label, items, onChange, addLabel }: {
  label: string; items: string[]; onChange: (v: string[]) => void; addLabel: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</legend>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1">
            <textarea
              rows={1}
              aria-label={`${label} ${i + 1}`}
              className={`${inputCls} field-sizing-content`}
              value={item}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <RowControls index={i} length={items.length} label={`${label} ${i + 1}`}
              onMove={(to) => onChange(move(items, i, to))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="mt-1 text-blue-700" onClick={() => onChange([...items, ""])}>+ {addLabel}</Button>
    </fieldset>
  );
}

/** Text input that keeps a local draft and commits on blur (for comma-separated values). Re-key it to reset. */
export function DraftInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void; "aria-label": string; className?: string; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      {...rest}
      className={rest.className ?? inputCls}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
