# Java inputs and documentation evaluation

Open /home and sign in. In **Add private Java input**, upload an uncompressed CoCoMUT JSONL extract or paste one Java method and its Javadoc. The upload accepts CoCoMUT row schema 0.4.0 or 0.5.0, up to 100 methods and 2 MB per project. The paste form takes a method with a body and a plain declaration. Keep its Javadoc in the separate field. Use CoCoMUT for declarations with annotations, constructors or full project context. The demo remains available without an account.

## Produce a local extract

CoCoMUT needs JDK 17 or later and compiled project bytecode. The commands below install the pinned extractor in a local checkout and run it against a trusted Apache-licensed release. CoCoMUT can run the repository's build with `--allow-build`. For untrusted repositories, build in a sandbox you control, then supply the compiled artifacts using `--skip-build --class-output /path/to/classes`. DocLens consumes the JSONL export.

```sh
git clone https://github.com/assert-lab/CoCoMUT.git
git -C CoCoMUT checkout 59f6a79cc15e00b7741e5460d0dfc01c88215fc8
git clone --depth 1 --branch rel/commons-dbutils-1.8.1 https://github.com/apache/commons-dbutils.git
(cd commons-dbutils && ../CoCoMUT/bin/cocomut --project . --scope entry-points \
  --source-set main --allow-build --output-dir ../extraction)
```

Choose a subset for a large export. For the DbUtils example, the first 10 rows fit the upload limit.

```sh
head -n 10 extraction/method_contexts*.jsonl > dbutils-sample.jsonl
```

Upload `dbutils-sample.jsonl`. DocLens preserves method URIs and extracted provenance without requiring a public repository URL. Keep the generated extraction manifest with your local export to retain its full revision and build details.

## Evaluate a method

**Evaluate** saves a report visible only to the signed-in account. Completeness checks locally present Javadoc components. The Java helpfulness rubric adapts DocAgent's clarity, descriptive depth, parameter utility and guidance criteria. Truthfulness confirms only references matched in available metadata and marks unresolved references separately. Behavioral review uses the method and available dependency excerpts, with evidence checked against exact source text. Some metrics can be unscored when evidence is missing. Static analysis and model judgments have limited coverage, particularly for dynamic dispatch and external contracts.

Hosted evaluation sends bounded excerpts to DeepSpace's OpenAI and Cloudflare Jev integrations using the signed-in user's credits. OpenAI gpt-4o-mini is billed by usage with tier-dependent pricing. The DeepSpace catalog quoted Jev at USD 0.00000005733 per input token when this implementation was verified. Review the current catalog with `npx deepspace integrations info openai/chat-completion` and `npx deepspace integrations info cloudflare/jev`.

[CoCoMUT source and usage](https://github.com/assert-lab/CoCoMUT) · [DbUtils license](https://github.com/apache/commons-dbutils/blob/rel/commons-dbutils-1.8.1/LICENSE.txt) · [DocAgent evaluation framework](https://aclanthology.org/2025.acl-demo.44/)
