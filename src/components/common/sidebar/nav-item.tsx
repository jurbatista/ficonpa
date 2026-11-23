import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tailgrids/core/tooltip";
import { cn } from "@/utils/cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavEntry } from "./data";
import { isPathActive } from "./utils";

export default function NavItem({
  item,
  collapsed,
  onItemClick,
}: {
  item: NavEntry;
  collapsed?: boolean;
  onItemClick?: () => void;
}) {
  const pathname = usePathname();
  const active = [item.url, ...(item.also ?? [])].some((href) => isPathActive(href, pathname));

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <Tooltip placement="right">
          <TooltipTrigger asChild>
            <Link
              href={item.url}
              onClick={onItemClick}
              aria-label={item.title}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center justify-center rounded-lg px-3 py-2.5 transition-colors",
                active
                  ? "bg-sidebar-navigation-nav-item-nav-hover-background text-icon-primary"
                  : "text-icon-tertiary hover:bg-sidebar-navigation-nav-item-nav-hover-background hover:text-icon-primary",
              )}
            >
              {item.icon}
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p>{item.title}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <Link
      href={item.url}
      onClick={onItemClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-navigation-nav-item-nav-hover-background text-text-primary"
          : "text-text-secondary hover:bg-sidebar-navigation-nav-item-nav-hover-background hover:text-text-primary",
      )}
    >
      <span className={active ? "text-icon-primary" : "text-icon-tertiary"}>{item.icon}</span>
      <span>{item.title}</span>
    </Link>
  );
}
