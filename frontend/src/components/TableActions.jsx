import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TableActions({ label = "Actions", children, testId }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[var(--ck-line)] bg-white text-[var(--ck-muted)] hover:text-[var(--ck-black)] hover:border-[var(--ck-orange)]"
          title={label}
          data-testid={testId}
        >
          <MoreHorizontal size={16} />
          <span className="sr-only">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TableActionItem({ icon: Icon, children, className = "", ...props }) {
  return (
    <DropdownMenuItem className={className} {...props}>
      {Icon && <Icon size={14} />}
      <span>{children}</span>
    </DropdownMenuItem>
  );
}
