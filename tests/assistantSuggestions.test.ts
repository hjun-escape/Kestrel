import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestedQuestions } from "../src/components/assistant/assistantData.js";

const GENERIC_SUGGESTIONS = [
  { prompt: "Which borrowers need attention this week?", send: true },
  { prompt: "What's our exposure at risk?", send: true },
  { prompt: "Screen a new applicant: ", label: "Screen a new applicant", send: false },
];

test("suggests questions about the riskiest companies in the book", () => {
  const questions = suggestedQuestions([
    { name: "Stone Brewing", status: "red" },
    { name: "Ruiz Foods", status: "red" },
  ]);

  assert.deepEqual(
    questions.slice(-2).map(({ prompt }) => prompt),
    ["Check Ruiz Foods for other lenders", "Summarise Stone Brewing's warning signs"],
  );
});

test("both company questions use the only available company", () => {
  const questions = suggestedQuestions([{ name: "Essendant", status: "yellow" }]);

  assert.deepEqual(
    questions.slice(-2).map(({ prompt }) => prompt),
    ["Check Essendant for other lenders", "Summarise Essendant's warning signs"],
  );
});

test("returns only generic suggestions when there is no named company", () => {
  for (const companies of [null, [], [{ name: "" }]]) {
    assert.deepEqual(suggestedQuestions(companies), GENERIC_SUGGESTIONS);
  }
});

test("does not suggest old seed companies", () => {
  const questions = suggestedQuestions([{ name: "Stone Brewing" }, { name: "Ruiz Foods" }]);

  assert.doesNotMatch(JSON.stringify(questions), /Crestline|Northfield/);
});
