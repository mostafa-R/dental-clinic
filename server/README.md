# Dental OS — Server

Express 5 + MongoDB (Mongoose) + Redis + Socket.io API for Dental OS.

## Running the test suite (MongoDB replica set required)

The integration suite exercises **multi-document ACID transactions**
(atomic invoice sequences, payment/commission races, double-booking guards,
patient quota slots, tenant isolation). MongoDB transactions are only
supported on a **replica set** (or sharded cluster) — never on a standalone
`mongod`.

Against a standalone `mongod` you will see false failures such as:

- `MongoServerError: Transaction numbers are only allowed on a replica set
  member or mongos`
- `This MongoDB deployment does not support retryable writes`
- Zero-winner concurrency assertions (no document is ever persisted)
- Skipped transaction-gated financial tests

These are environment artifacts, not code regressions. CI
(`.github/workflows/ci.yml`) already starts a single-node replica set named
**`rs0`** for exactly this reason; local runs must do the same.

### 1. Start a single-node replica set (local dev)

```bash
mkdir -p /tmp/mongo-data
mongod --dbpath /tmp/mongo-data --port 27017 --bind_ip 127.0.0.1 --replSet rs0
```

### 2. Initiate the set (once per fresh dbpath)

```js
// via mongosh, or: db.adminCommand() with any driver
rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] });
```

### 3. Verify it is healthy

The node must report itself as primary of set `rs0`:

```js
const hello = await db.adminCommand({ hello: 1 });
// expect: hello.setName === 'rs0' && hello.isWritablePrimary === true
```

If `setName` is missing, the set was never initiated — repeat step 2 and
wait a few seconds for election.

### 4. Point the suite at it and run serially

```bash
export TEST_MONGO_URI='mongodb://127.0.0.1:27017/dental_os_test'
npm run check   # syntax gate
npm test        # full suite — files run serially (vitest.config.js sets
                # fileParallelism: false) because all files share the one
                # dental_os_test database
```

Notes:

- `TEST_MONGO_URI` falls back to
  `mongodb://127.0.0.1:27017/dental_os_test` when unset, but export it
  explicitly so the target is never ambiguous.
- **Never run two suites concurrently** against the same database (e.g. a
  background `npm test` plus a focused file): the files wipe shared
  collections and will contaminate each other's fixtures, producing
  failures that pass in isolation.
- Tests run with `TZ=UTC` (`__tests__/setup.js`) so date/time assertions are
  deterministic, and time-sensitive fixtures must be computed relative to
  `Date.now()` — never hardcoded calendar dates (see Slice S0:
  `doctorAvailability.integration.test.js`).
