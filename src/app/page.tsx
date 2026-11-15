"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [pantryItems, setPantryItems] = useState<any[]>([]);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    const { data, error } = await supabase
      .from("pantry_items")
      .select("*");

    if (data) {
      setPantryItems(data);
    }
  }

  return (
    <main style={{ padding: "2rem", direction: "rtl", fontFamily: "sans-serif" }}>
      <h1>המזווה של cooki</h1>
      <ul style={{ fontSize: "1.2rem", lineHeight: "2" }}>
        {pantryItems.map((item) => (
          <li key={item.id}>
            <strong>{item.item_name}</strong>: {item.quantity}
          </li>
        ))}
      </ul>
    </main>
  );
}