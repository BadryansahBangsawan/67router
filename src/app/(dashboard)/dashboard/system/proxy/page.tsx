"use client";
import { useTranslations } from "next-intl";
import { PageHeader } from "@omniroute/ui-kit/page-header";
import ProxyTab from "@/app/(dashboard)/dashboard/settings/components/ProxyTab";

export default function ProxyPage() {
  const tSidebar = useTranslations("sidebar");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader compact title={tSidebar("proxy")} description={tSidebar("proxySubtitle")} />
      <ProxyTab />
    </div>
  );
}
