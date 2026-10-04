import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { auth } = await getDictionary();
  return { title: auth.signIn, robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const { auth } = await getDictionary();
  const { next } = await searchParams;
  return <AuthScreen mode="login" locale={await getLocale()} dict={auth} next={next} />;
}
