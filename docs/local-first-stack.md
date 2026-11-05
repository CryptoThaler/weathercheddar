# Local-first stack: Ollama + vLLM + LangGraph on an M4 Mac (air-gapped weather/Kalshi pipeline)

*Snapshot: November 2026. These projects move fast, so pin versions and recheck the linked sources before relying on any detail.*

## TL;DR

- **Do the numbers in code and keep the LLM for language.** Bin probabilities, the climate-day high and spreads come from deterministic code (`agent/kalshi-bins.mjs`). The LLM reads forecast discussions, writes the briefing and fills structured fields. It never does the arithmetic.
- **Ollama** is the simplest single-user server on a Mac. **vLLM via `vllm-metal`** is worth adding only when several agents call the model concurrently.
- **LangGraph** orchestrates the pipeline. A SQLite checkpointer gives durable, resumable runs on one machine, and an `interrupt()` makes a human approve anything that touches money.
- **"Air-gapped" still needs a data path.** METAR and NWS live on the internet. Fetch on a connected host, move signed JSON snapshots inside, and run the models and the graph offline.

## 1. Model serving on Apple Silicon (M4)

| | Ollama | vLLM + `vllm-metal` |
|---|---|---|
| Fit | One user, a few agents, fastest setup | Concurrent agent traffic, OpenAI-compatible server with batching |
| Apple Silicon backend | MLX engine, previewed in 0.19 (Mar 2026) and extended in later releases ([Ollama blog](https://ollama.com/blog), [AppleInsider](https://appleinsider.com/articles/26/03/31/ollama-is-supercharged-by-mlxs-unified-memory-use-on-apple-silicon)) | Plugin from the vLLM project. Upstream vLLM supplies the API server and scheduler; `mlx_lm` supplies the model layers. Needs macOS 15+ ([repo](https://github.com/vllm-project/vllm-metal), [docs](https://docs.vllm.ai/projects/vllm-metal/en/latest/)) |
| Concurrency | Fine for a handful of requests | Concurrent serving announced Sept 2026 ([vLLM blog](https://vllm.ai/blog/2026-09-22-vllm-metal-v0-28-0)) |
| Structured output | JSON-schema `format` in the Python/JS libraries ([Ollama blog](https://ollama.com/blog)) | OpenAI-style `response_format` / guided decoding. Check which modes the Metal plugin supports for your version |
| Caveats | Ollama recommends >32 GB unified memory for the MLX path, and only some architectures run on MLX ([AppleInsider](https://appleinsider.com/articles/26/03/31/ollama-is-supercharged-by-mlxs-unified-memory-use-on-apple-silicon)). Raise `num_ctx` above the default when using tools, or long tool schemas get truncated. | Several look-alike forks exist; install from `vllm-project/vllm-metal` only. M5-specific speedups (NAX units) don't apply to M4 ([repo](https://github.com/vllm-project/vllm-metal)). |

Practical defaults on an M4 (unverified rules of thumb, so measure on your own machine):
- **16–24 GB:** a 7–9B instruct model at 4-bit for parsing and summaries.
- **32–64 GB:** 14–32B for better reasoning over long NWS discussions.
- **Leave headroom.** Unified memory is shared with the OS and data jobs.
- **One model per role**, e.g. a small fast one for extraction and a larger one for the daily briefing.

## 2. Orchestration with LangGraph

Graph sketch for one trading day:

```
ingest_snapshot ─► validate ─► price_bins (tool: kalshi-bins --json) ─► read_afd (LLM, structured)
                                                                     └► briefing (LLM)
                                                      ─► compare_to_market ─► interrupt("approve?") ─► log/export
```

- **Use tools for anything numeric.** Wrap `agent/kalshi-bins.mjs --json` (or a Python port) as a tool and have the graph read its JSON. Don't ask the LLM to compute probabilities.
- **Use structured LLM outputs.** For example, have the model extract "forecaster confidence", "timing of frontal passage" and "cloud/precip risk to the high" from the NWS Area Forecast Discussion into a JSON schema. The numeric model can use these as a σ adjustment only after you backtest that it helps.
- **Make runs durable.** Interrupts need a checkpointer. Use `InMemorySaver` for tests and `SqliteSaver` on a single box ([LangGraph interrupts docs](https://docs.langchain.com/oss/python/langgraph/interrupts)). Move to Postgres only for multi-process or many paused threads ([guide](https://cadenya.com/other-content/langgraph-in-production)).
- **Put a human gate before money moves.** `interrupt()` pauses the run, and `Command(resume=...)` on the same `thread_id` continues it. The interrupted node **re-runs from the top** on resume, so keep side effects after the interrupt or make them idempotent ([docs](https://docs.langchain.com/oss/python/langgraph/interrupts)).
- **Pin versions.** Third-party guides disagree on the current LangGraph version, so take it from PyPI or GitHub releases.

## 3. Air-gapped data flow

```
[connected host]  data/fetchers.js (fetchBundle) ──► snapshot-YYYYMMDDTHHMMZ.json + sha256
        │ one-way transfer (USB/diode/rsync to a drop folder)
[air-gapped M4]   verify hash ─► LangGraph run (fetch = file reader) ─► Ollama/vLLM on 127.0.0.1
```

- **Snapshot on the connected side.** `fetchBundle` returns everything for a run, with per-source errors. Write it plus a checksum, and refresh at least hourly. Both METAR and NWS hourly forecasts update roughly hourly.
- **Replay inside.** Every fetcher accepts an injected `fetch`, so point it at a reader that serves the snapshot files. That's how `--fixtures` works today.
- **Stage models offline.** Run `ollama pull` on the connected host and copy the model store across. For vLLM, download weights from Hugging Face, copy them over, and set `HF_HUB_OFFLINE=1`. Build a pip/npm wheelhouse or offline cache for dependencies.
- **Turn off phone-home.** Set `LANGSMITH_TRACING=false` (or don't set the key), bind servers to `127.0.0.1`, and block egress at the firewall so leaks show up as errors rather than silent calls.
- **Log every decision.** Record the snapshot hash, model and version, prompt, bin output and the human decision for each run, so results can be backtested against the CLI reports.

## 4. What to validate before trusting it

1. **Backtest against settlements.** Compare the bin model's probabilities with historical CLI reports per station and season, and fit σ and the anomaly weight instead of the placeholders.
2. **Check METAR against the CLI.** Measure how often the METAR peak (hourly plus 6-h max groups) differs from the CLI max, per station.
3. **Prove the LLM step adds value.** Measure whether the extracted forecast-discussion fields improve calibration. If they don't, drop them; the briefing still has value on its own.
4. **Test latency under load.** Run concurrent graph runs (e.g. 24 stations) on your M4 with Ollama and with `vllm-metal` before choosing.

Sources: [vllm-project/vllm-metal](https://github.com/vllm-project/vllm-metal) · [vllm-metal docs](https://docs.vllm.ai/projects/vllm-metal/en/latest/) · [vLLM blog: concurrent serving on Apple Silicon](https://vllm.ai/blog/2026-09-22-vllm-metal-v0-28-0) · [Docker Model Runner + vllm-metal](https://www.docker.com/blog/docker-model-runner-vllm-metal-macos/) · [Ollama blog](https://ollama.com/blog) · [AppleInsider on Ollama MLX](https://appleinsider.com/articles/26/03/31/ollama-is-supercharged-by-mlxs-unified-memory-use-on-apple-silicon) · [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) · [LangGraph in production guide](https://cadenya.com/other-content/langgraph-in-production)
