"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { emitProductEvent } from "@/lib/liminal/productEvents";

export function ProductPageview() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || previous.current === pathname) return;
    previous.current = pathname;
    emitProductEvent("$pageview");
  }, [pathname]);
  return null;
}
