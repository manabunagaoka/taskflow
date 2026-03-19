import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateDropdownPos = useCallback(() => {
    if (textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, []);

  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
      const lastAt = val.lastIndexOf("@");
      if (lastAt !== -1 && lastAt === val.length - 1) {
        setShowMentions(true);
        setMentionFilter("");
        updateDropdownPos();
      } else if (lastAt !== -1) {
        const afterAt = val.slice(lastAt + 1);
        if (!afterAt.includes(" ") || afterAt.split(" ").length <= 2) {
          setShowMentions(true);
          setMentionFilter(afterAt);
          updateDropdownPos();
        } else {
          setShowMentions(false);
        }
      } else {
        setShowMentions(false);
      }
    },
    [onChange, updateDropdownPos],
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

  // Close dropdown on scroll or resize
  useEffect(() => {
    if (!showMentions) return;
    const close = () => setShowMentions(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showMentions]);

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(mentionFilter.toLowerCase()),
  );

  return (
    <>
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
        onBlur={() => setTimeout(() => setShowMentions(false), 200)}
      />
      {showMentions && filtered.length > 0 &&
        createPortal(
          <div
            className="w-48 bg-popover border rounded-md shadow-md max-h-32 overflow-y-auto"
            style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          >
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
          </div>,
          document.body,
        )}
    </>
  );
}
