import React from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Signed-in user chip with a Sign out action. Mount in any header:
//   import UserMenu from "@/components/auth/UserMenu";
//   <UserMenu />
// Renders nothing when no one is signed in.
export default function UserMenu({ className = "" }) {
  const { user, displayName, email, initials, signOut } = useAuth();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${displayName}`}
        className={`inline-flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-sm text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${className}`}
      >
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[11rem] truncate font-medium sm:inline">{displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
          {email && email !== displayName && <p className="truncate text-xs text-slate-600">{email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
