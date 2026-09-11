/**
 * Chat service integration tests.
 *
 * Covers the real `chat.service.js` against a live Mongo DB (no mocking of the
 * service), focused on the behaviours that route-level tests cannot catch:
 *   1. Critical regression: DM send with a *populated branch object* (the exact
 *      shape `protect` produces) must NOT be rejected by the isolation guard.
 *   2. Cross-branch / cross-tenant DM recipients must be rejected.
 *   3. markRead returns the real updated count and the senders of the affected
 *      messages (not the input length).
 *   4. getUnreadCounts is tenant-scoped: a message from another tenant in the
 *      same branch is not counted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { toObjectId } from "../utils/branchScope.js";
import * as chatService from "../modules/chat/chat.service.js";
import Message from "../modules/chat/message.model.js";
import ChannelRead from "../modules/chat/channelRead.model.js";
import User from "../modules/users/user.model.js";

let B1, B2, T1, T2;
let SENDER, RECIPIENT, OTHER_TENANT_USER;

beforeAll(async () => {
  const testDbUri = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/dental_os_test";
  await mongoose.connect(testDbUri);

  B1 = toObjectId(new mongoose.Types.ObjectId());
  B2 = toObjectId(new mongoose.Types.ObjectId());
  T1 = toObjectId(new mongoose.Types.ObjectId());
  T2 = toObjectId(new mongoose.Types.ObjectId());

  SENDER = await User.create({
    tenant: T1, branch: B1, name: "Sender", email: "sender@test.com",
    username: "sender_unq", password: "x", roleId: new mongoose.Types.ObjectId(),
  });
  RECIPIENT = await User.create({
    tenant: T1, branch: B1, name: "Recipient", email: "recipient@test.com",
    username: "recipient_unq", password: "x", roleId: new mongoose.Types.ObjectId(),
  });
  OTHER_TENANT_USER = await User.create({
    tenant: T2, branch: B1, name: "Other Tenant", email: "other@test.com",
    username: "other_unq", password: "x", roleId: new mongoose.Types.ObjectId(),
  });
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  const colls = mongoose.connection.collections;
  if (colls[Message.collection.name]) await colls[Message.collection.name].deleteMany({});
  if (colls[ChannelRead.collection.name]) await colls[ChannelRead.collection.name].deleteMany({});
});

describe("chatService.sendMessage — branch isolation", () => {
  it("allows a DM to a same-branch, same-tenant recipient when branch is a populated object", async () => {
    // `protect` populates branch into an object ({ _id, name, ... }) — this is
    // the regression that used to throw `String(object) === "[object Object]"`.
    const populatedBranch = { _id: B1, name: "Main", isActive: true };
    const { message } = await chatService.sendMessage({
      branch: populatedBranch,
      tenant: T1,
      senderId: SENDER._id,
      recipient: RECIPIENT._id,
      content: "hello",
    });
    expect(message.recipient.toString()).toBe(RECIPIENT._id.toString());
    expect(message.branch.toString()).toBe(B1.toString());
  });

  it("rejects a DM to a user in a different branch", async () => {
    const otherBranchUser = await User.create({
      tenant: T1, branch: B2, name: "Other Branch", email: "ob@test.com",
      username: "ob_unq", password: "x", roleId: new mongoose.Types.ObjectId(),
    });
    await expect(
      chatService.sendMessage({
        branch: { _id: B1 },
        tenant: T1,
        senderId: SENDER._id,
        recipient: otherBranchUser._id,
        content: "x",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a DM to a user that is not active", async () => {
    const inactive = await User.create({
      tenant: T1, branch: B1, name: "Inactive", email: "in@test.com",
      username: "in_unq", password: "x", roleId: new mongoose.Types.ObjectId(),
      isActive: false,
    });
    await expect(
      chatService.sendMessage({
        branch: { _id: B1 },
        tenant: T1,
        senderId: SENDER._id,
        recipient: inactive._id,
        content: "x",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("chatService.markRead", () => {
  it("returns the real updated count and the affected senders", async () => {
    const m1 = await Message.create({
      branch: B1, tenant: T1, sender: SENDER._id, recipient: RECIPIENT._id, content: "a",
    });
    const m2 = await Message.create({
      branch: B1, tenant: T1, sender: SENDER._id, recipient: RECIPIENT._id, content: "b",
    });
    // A message this user does NOT own (they are the sender, not recipient).
    const notMine = await Message.create({
      branch: B1, tenant: T1, sender: RECIPIENT._id, recipient: SENDER._id, content: "c",
    });

    const { updated, senders } = await chatService.markRead(B1, RECIPIENT._id, [
      m1._id, m2._id, notMine._id,
    ]);

    expect(updated).toBe(2);
    expect(senders).toEqual([SENDER._id.toString()]);
  });
});

describe("chatService.getUnreadCounts — tenant scoping", () => {
  it("does not count messages from senders in another tenant sharing the branch", async () => {
    await Message.create({
      branch: B1, tenant: T2, sender: OTHER_TENANT_USER._id, recipient: SENDER._id, content: "other tenant dm",
    });
    const unread = await chatService.getUnreadCounts(B1, SENDER._id, T1);
    expect(unread[OTHER_TENANT_USER._id.toString()]).toBeUndefined();
  });

  it("counts same-tenant unread DMs per sender", async () => {
    await Message.create({
      branch: B1, tenant: T1, sender: RECIPIENT._id, recipient: SENDER._id, content: "dm 1",
    });
    await Message.create({
      branch: B1, tenant: T1, sender: RECIPIENT._id, recipient: SENDER._id, content: "dm 2",
    });
    const unread = await chatService.getUnreadCounts(B1, SENDER._id, T1);
    expect(unread[RECIPIENT._id.toString()]).toBe(2);
  });

  it("counts channel unread scoped to the tenant", async () => {
    await Message.create({
      branch: B1, tenant: T1, sender: RECIPIENT._id, channel: "general", content: "ch",
    });
    // Same branch+channel but different tenant — must NOT count for T1.
    await Message.create({
      branch: B1, tenant: T2, sender: OTHER_TENANT_USER._id, channel: "general", content: "other ch",
    });
    const unread = await chatService.getUnreadCounts(B1, SENDER._id, T1);
    expect(unread["channel:general"]).toBe(1);
  });
});
