import { Metadata } from "next";
import { pageSEO } from "@/lib/seo";

export const metadata: Metadata = pageSEO.register;

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
