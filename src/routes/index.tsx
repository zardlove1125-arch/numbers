import { createFileRoute } from "@tanstack/react-router";
import { Agefuda } from "@/components/Agefuda";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Numbers" },
      {
        name: "description",
        content: "効果を1枚付けて同時に出す。点が多い方が勝つ数字対戦。",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return <Agefuda />;
}
