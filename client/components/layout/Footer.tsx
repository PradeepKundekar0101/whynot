import Link from "next/link";

const footerLinks = [
  { label: "Blog", href: "#" },
  { label: "Careers", href: "#" },
  { label: "About Us", href: "#" },
  { label: "FAQ", href: "#" },
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Contact", href: "#" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-white py-6 px-4">
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
        {footerLinks.map((link) => (
          <Link key={link.label} href={link.href} className="hover:text-foreground transition-colors">
            {link.label}
          </Link>
        ))}
        <span className="text-xs">English (US)</span>
      </div>
    </footer>
  );
}
