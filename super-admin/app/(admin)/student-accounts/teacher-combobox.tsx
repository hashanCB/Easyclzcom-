'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';

interface Teacher {
  id: string;
  username: string;
}

interface Props {
  teachers: Teacher[];
  defaultValue: string;   // teacher id
  defaultLabel: string;   // teacher username (resolved server-side)
}

export function TeacherCombobox({ teachers, defaultValue, defaultLabel }: Props) {
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState(defaultLabel);
  const [value,   setValue]   = useState(defaultValue);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? teachers.filter((t) => t.username.toLowerCase().includes(query.toLowerCase()))
    : teachers;

  // Close on outside click.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If input text doesn't match the selected teacher, restore label.
        if (value) {
          const t = teachers.find((t) => t.id === value);
          setQuery(t?.username ?? '');
        }
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [value, teachers]);

  function select(t: Teacher) {
    setValue(t.id);
    setQuery(t.username);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setValue('');
    setQuery('');
    inputRef.current?.focus();
    setOpen(true);
  }

  return (
    <div ref={containerRef} className="relative min-w-52">
      {/* Hidden field carries the id to the form */}
      <input type="hidden" name="teacher" value={value} />

      {/* Visible input */}
      <div
        className="flex h-9 items-center rounded-md border bg-background px-3 text-sm cursor-text gap-1"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setValue(''); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="All teachers"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-0"
        />
        {value ? (
          <button type="button" onClick={clear} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 pointer-events-none" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] rounded-md border bg-white shadow-md">
          <div className="max-h-60 overflow-y-auto py-1">
            {/* "All teachers" option */}
            {!query.trim() && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setValue(''); setQuery(''); setOpen(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors ${!value ? 'font-medium' : 'text-muted-foreground'}`}
              >
                All teachers
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">No teachers found.</p>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); select(t); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors font-mono ${
                    t.id === value ? 'bg-muted/60 font-semibold' : ''
                  }`}
                >
                  {t.username}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
