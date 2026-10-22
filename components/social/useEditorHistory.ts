"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EditHistory, sameComposition } from "@/lib/social/history";
import type { Composition, Project } from "@/lib/social/schema";

type Snapshot = Pick<Project, "composition" | "brand" | "concept" | "creativeBrief" | "generationSettings">;
const snapshot = (project: Project): Snapshot => ({ composition: project.composition, brand: project.brand, concept: project.concept, creativeBrief: project.creativeBrief, generationSettings: project.generationSettings });
const equal = (a: Snapshot, b: Snapshot) => sameComposition(a.composition, b.composition) && a.brand === b.brand && a.concept === b.concept && a.creativeBrief === b.creativeBrief && a.generationSettings === b.generationSettings;

export function useEditorHistory(project: Project, onProject: (patch: Partial<Project>) => void) {
  const [history] = useState(() => new EditHistory(snapshot(project), equal));
  const baselineRef = useRef({ task: project.generation?.taskId, image: project.composition.generatedImage, elements: new WeakMap<Element, number>(), count: 0 });
  useSyncExternalStore(history.subscribe, history.getVersion, history.getVersion);
  useEffect(() => {
    const baseline = baselineRef.current;
    const next = snapshot(project);
    if (baseline.task !== project.generation?.taskId || baseline.image !== project.composition.generatedImage) {
      baseline.task = project.generation?.taskId; baseline.image = project.composition.generatedImage;
      // A provider result becomes the new baseline; undo never starts or refunds a generation.
      if (!equal(history.current, next)) history.reset(next);
    } else if (!equal(history.current, next)) history.commit(next);
  }, [project, history]);
  function updateProject(patch: Partial<Project>) {
    const baseline = baselineRef.current;
    const next = { ...history.current, ...patch };
    let key: string | undefined;
    const active = document.activeElement;
    if (active?.matches("textarea, input[type=text], input:not([type])")) {
      if (!baseline.elements.has(active)) baseline.elements.set(active, ++baseline.count);
      key = `field-${baseline.elements.get(active)}`;
    }
    history.commit(next, key); onProject(next);
  }
  function undo() { const next = history.undo(); if (next) onProject(next); }
  function redo() { const next = history.redo(); if (next) onProject(next); }
  return { updateProject, updateComposition: (patch: Partial<Composition>) => updateProject({ composition: { ...history.current.composition, ...patch } }), undo, redo, begin: () => history.begin(), end: () => history.end(), canUndo: history.canUndo, canRedo: history.canRedo };
}
