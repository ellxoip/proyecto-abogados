"use client";

import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useState } from "react";

interface Column<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
}

interface ModernTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function ModernTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  searchable = false,
  searchPlaceholder = "Buscar..."
}: ModernTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchTerm, setSearchTerm] = useState("");

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
  };

  const filteredData = searchable
    ? data.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : data;

  const sortedData = sortColumn
    ? [...filteredData].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        const modifier = sortDirection === "asc" ? 1 : -1;
        
        if (aVal < bVal) return -1 * modifier;
        if (aVal > bVal) return 1 * modifier;
        return 0;
      })
    : filteredData;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-glass)"
      }}
    >
      {/* Search Bar */}
      {searchable && (
        <div className="p-4 border-b" style={{ borderColor: "var(--border-glass)" }}>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2"
              size={18}
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-glass)",
                color: "var(--text)"
              }}
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-glass)" }}>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => column.sortable && handleSort(String(column.key))}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {column.sortable && sortColumn === column.key && (
                      <span>
                        {sortDirection === "asc" ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  No se encontraron resultados
                </td>
              </tr>
            ) : (
              sortedData.map((row, index) => (
                <tr
                  key={index}
                  onClick={() => onRowClick?.(row)}
                  className="border-b transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                  style={{
                    borderColor: "var(--border-glass)",
                    cursor: onRowClick ? "pointer" : "default"
                  }}
                >
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className="px-6 py-4 text-sm"
                      style={{ color: "var(--text)" }}
                    >
                      {column.render
                        ? column.render(row[column.key as keyof T], row)
                        : String(row[column.key as keyof T] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {sortedData.length > 0 && (
        <div
          className="px-6 py-3 flex items-center justify-between text-xs"
          style={{ background: "var(--surface)", color: "var(--text-muted)" }}
        >
          <span>
            Mostrando {sortedData.length} de {data.length} resultados
          </span>
        </div>
      )}
    </div>
  );
}
