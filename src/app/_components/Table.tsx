import type { ReactNode } from "react";

export default function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-neutral-100 dark:bg-neutral-800">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border-b border-neutral-200 px-3 py-2 text-left font-semibold dark:border-neutral-700"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="odd:bg-white even:bg-neutral-50 dark:odd:bg-neutral-900 dark:even:bg-neutral-950">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-b border-neutral-100 px-3 py-2 font-mono text-xs dark:border-neutral-800"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
