"use client";
import { useEffect } from "react";
import { iniciarEventos } from "@/lib/v2/eventos";

export default function Eventos() {
  useEffect(() => { iniciarEventos(); }, []);
  return null;
}
