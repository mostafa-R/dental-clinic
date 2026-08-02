import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/users/user.model.js", () => {
  class MockUser {}
  MockUser.findOne = vi.fn();
  MockUser.create = vi.fn();
  MockUser.countDocuments = vi.fn();
  MockUser.findByIdAndUpdate = vi.fn();
  MockUser.findById = vi.fn();
  return { default: MockUser };
});

vi.mock("../modules/users/branch.model.js", () => ({
  default: { findOne: vi.fn(), findById: vi.fn() },
}));

vi.mock("../modules/users/role.model.js", () => ({
  default: { findById: vi.fn(), findOne: vi.fn() },
}));

vi.mock("../modules/site/tenant/tenant.model.js", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("../modules/patients/patient.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../utils/cache.js", () => ({ invalidatePermission: vi.fn() }));

vi.mock("../socket/index.js", () => ({ emitToBranch: vi.fn() }));

import { updateUser } from "../modules/users/user.controller.js";
import User from "../modules/users/user.model.js";

function makeUser({ tokenVersion = 0 } = {}) {
  const user = {
    _id: "u1",
    name: "Dr Test",
    phone: "",
    tokenVersion,
    save: vi.fn(),
    populate: vi.fn(),
    toSafeObject: () => ({ _id: "u1", name: "Dr Test" }),
  };
  user.save.mockResolvedValue(user);
  user.populate.mockResolvedValue(user);
  return user;
}

function makeRes() {
  return {
    status: vi.fn(function () {
      return this;
    }),
    json: vi.fn(function () {
      return this;
    }),
  };
}

const USER_ID = "507f1f77bcf86cd799439011";

function makeReq(user, body) {
  return {
    params: { id: USER_ID },
    user: { _id: "507f1f77bcf86cd799439012", branch: "b1" },
    validatedBody: body,
    query: {},
    _roleResolved: { isSystemAdmin: false },
  };
}

async function runUpdate(req, res) {
  const next = vi.fn();
  updateUser(req, res, next);
  await new Promise((r) => setTimeout(r, 0));
  if (next.mock.calls.length) throw next.mock.calls[0][0];
}

describe("updateUser password change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bumps tokenVersion when the password changes, revoking old sessions", async () => {
    const user = makeUser({ tokenVersion: 0 });
    vi.mocked(User.findOne).mockResolvedValue(user);

    const res = makeRes();
    await runUpdate(makeReq(user, { password: "NewPass123!" }), res);
    expect(user.password).toBe("NewPass123!");
    expect(user.tokenVersion).toBe(1);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not bump tokenVersion for a non-password update", async () => {
    const user = makeUser({ tokenVersion: 5 });
    vi.mocked(User.findOne).mockResolvedValue(user);

    const res = makeRes();
    await updateUser(makeReq(user, { phone: "+15551234567" }), res);

    expect(user.password).toBeUndefined();
    expect(user.tokenVersion).toBe(5);
  });

  it("bumps from a null/default tokenVersion (first password set)", async () => {
    const user = makeUser({ tokenVersion: 0 });
    vi.mocked(User.findOne).mockResolvedValue(user);

    const res = makeRes();
    await runUpdate(makeReq(user, { password: "AnotherPass1!" }), res);
    expect(user.tokenVersion).toBe(1);
  });
});
