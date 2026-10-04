/** Account pages are reached from the header dropdown, so no side navigation here. */
export default function AccountLayout({ children }: LayoutProps<"/[lang]/account">) {
  return <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:py-8">{children}</div>;
}
