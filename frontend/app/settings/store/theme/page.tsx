import { redirect } from "next/navigation";

export default function ThemeRedirect() {
  redirect("/settings/store?tab=design");
}
