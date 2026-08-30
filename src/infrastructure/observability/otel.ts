import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter, type SpanExporter } from '@opentelemetry/sdk-trace-base';

/** OTLP exporter when configured; console fallback otherwise (FR-039). */
export function createSpanExporter(otlpEndpoint: string | undefined): SpanExporter {
  if (otlpEndpoint) {
    return new OTLPTraceExporter({ url: otlpEndpoint });
  }
  return new ConsoleSpanExporter();
}

/** Auto-instruments incoming HTTP/Express requests with basic request tracing. */
export function startObservability(otlpEndpoint: string | undefined): NodeSDK {
  const sdk = new NodeSDK({
    traceExporter: createSpanExporter(otlpEndpoint),
    instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
  });
  sdk.start();
  return sdk;
}
