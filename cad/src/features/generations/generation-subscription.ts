import { useCallback, useEffect, useState } from "react";
import { entities } from "@ispo/sdk";

import { classifyProjectError, type CadProductError } from "@/lib/project-errors";
import {
  GENERATION_TYPE,
  MODEL_TYPE,
  normalizeEntityRecord,
  type CadGeneration,
  type CadModel,
  type EntityRecord,
} from "./generation-model";

type CadDataState = {
  models: EntityRecord<CadModel>[];
  generations: EntityRecord<CadGeneration>[];
  status: "loading" | "ready" | "denied" | "error";
  error: CadProductError | null;
};

const initialState: CadDataState = {
  models: [],
  generations: [],
  status: "loading",
  error: null,
};

export function useCadData() {
  const [state, setState] = useState<CadDataState>(initialState);

  const refresh = useCallback(async () => {
    try {
      const [models, generations] = await Promise.all([
        entities.query<CadModel>(MODEL_TYPE, {
          orderBy: [{ field: "updatedAt", direction: "desc" }],
          limit: 100,
        }),
        entities.query<CadGeneration>(GENERATION_TYPE, {
          orderBy: [{ field: "createdAt", direction: "desc" }],
          limit: 200,
        }),
      ]);
      setState({
        models: (models.records ?? []).map((record) => normalizeEntityRecord<CadModel>(record)),
        generations: (generations.records ?? []).map((record) => normalizeEntityRecord<CadGeneration>(record)),
        status: "ready",
        error: null,
      });
    } catch (error) {
      const classified = classifyProjectError(error, "CAD records could not be loaded.");
      setState({
        models: [],
        generations: [],
        status: classified.kind === "access" ? "denied" : "error",
        error: classified,
      });
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    void refresh();
    const notify = () => {
      if (!disposed) void refresh();
    };
    const modelSubscription = entities.subscribe({ type: MODEL_TYPE }, notify);
    const generationSubscription = entities.subscribe({ type: GENERATION_TYPE }, notify);
    return () => {
      disposed = true;
      modelSubscription.close();
      generationSubscription.close();
    };
  }, [refresh]);

  return { ...state, refresh };
}
