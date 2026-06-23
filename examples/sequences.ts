/**
 * Document numbering sequences (series): list → create → get → register with the
 * Tax Authority → set as the account's current sequence.
 */
import {
  client,
  getSequencesJson,
  postSequencesJson,
  getSequencesBySequenceIdJson,
  putSequencesBySequenceIdRegisterJson,
  putSequencesBySequenceIdSetCurrentJson,
  type SequenceRequest,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // List all sequences.
  const { data: list } = await getSequencesJson({ query: { api_key } });
  console.log(`${list?.sequences.length ?? 0} sequences`);

  // Create a sequence. `default_sequence: "1"` makes it the current one.
  const newSequence: SequenceRequest = {
    sequence: { serie: "2026", default_sequence: "0" },
  };
  const { data: created, error } = await postSequencesJson({
    query: { api_key },
    body: newSequence,
  });
  if (error || !created?.sequence?.id) {
    console.error("create failed", error);
    return;
  }
  const sequenceId = created.sequence.id;

  // Read it back.
  await getSequencesBySequenceIdJson({
    path: { "sequence-id": sequenceId },
    query: { api_key },
  });

  // Register it with the Tax Authority, then make it the current sequence.
  await putSequencesBySequenceIdRegisterJson({
    path: { "sequence-id": sequenceId },
    query: { api_key },
  });
  await putSequencesBySequenceIdSetCurrentJson({
    path: { "sequence-id": sequenceId },
    query: { api_key },
  });
}

main();
