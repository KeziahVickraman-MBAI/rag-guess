import { BLOCK_LABELS, BLOCKS } from "../lib/blocks";
import type { Note } from "../lib/types";
import { inputCls } from "./ui";

export function NotesTable({ notes, onChange }: { notes: Note[]; onChange: (notes: Note[]) => void }) {
  const update = (id: string, patch: Partial<Note>): void => onChange(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  return (
    <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-2 py-2">Use</th>
            <th scope="col" className="px-2 py-2">ID</th>
            <th scope="col" className="px-2 py-2">Block</th>
            <th scope="col" className="w-full px-2 py-2">Text</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n) => (
            <tr key={n.id} className={`border-t border-slate-100 ${n.included ? "" : "opacity-50"} ${n.block === "unknown" ? "bg-amber-50" : ""}`}>
              <td className="px-2 py-1 text-center">
                <input type="checkbox" aria-label={`Include note ${n.id}`} className="h-4 w-4" checked={n.included}
                  onChange={(e) => update(n.id, { included: e.target.checked })} />
              </td>
              <td className="px-2 py-1 font-mono text-xs text-slate-500">{n.id}</td>
              <td className="px-2 py-1">
                <select aria-label={`Block for note ${n.id}`} className={`${inputCls} min-w-48`} value={n.block}
                  onChange={(e) => update(n.id, { block: e.target.value as Note["block"] })}>
                  {BLOCKS.map((b) => <option key={b} value={b}>{BLOCK_LABELS[b]}</option>)}
                </select>
              </td>
              <td className="px-2 py-1">
                <textarea rows={1} aria-label={`Text of note ${n.id}`} className={`${inputCls} field-sizing-content`} value={n.text}
                  onChange={(e) => update(n.id, { text: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
