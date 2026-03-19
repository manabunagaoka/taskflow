import { useState, useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { Member } from "@shared/schema";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  placeholder?: string;
  className?: string;
  rows?: number;
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onInput?: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  id?: string;
}

export function MentionTextarea({
  value,
  onChange,
  members,
  placeholder,
  className,
  rows,
  onFocus,
  onInput,
  id,
}: MentionTextareaProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
      const lastAt = val.lastIndexOf("@");
      if (lastAt !== -1 && lastAt === val.length - 1) {
        setShowMentions(true);
        setMentionFilter("");
      } else if (lastAt !== -1) {
        const afterAt = val.slice(lastAt + 1);
        if (!afterAt.includes(" ") || afterAt.split(" ").length <= 2) {
          setShowMentions(true);
          setMentionFilter(afterAt);
        } else {
          setShowMentions(false);
        }
      } else {
        setShowMentions(false);
      }
    },
    [onChange],
  );

  const insertMention = useCallback(
    (name: string) => {
      const lastAt = value.lastIndexOf("@");
      onChange(value.slice(0, lastAt) + `@${name} `);
      setShowMentions(false);
      textareaRef.current?.focus();
    },
    [value, onChange],
  );

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(mentionFilter.toLowerCase()),
  );

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder ? `${placeholder} (@ to mention)` : "@ to mention"}
        className={className}
        rows={rows}
        onFocus={onFocus}
        onInput={onInput}
      />
      {showMentions && filtered.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 w-48 bg-popover border rounded-md shadow-md z-50 max-h-32 overflow-y-auto">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(m.name);
              }}
            >
              {(m as any).type === "agent" ? "🤖 " : ""}
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
