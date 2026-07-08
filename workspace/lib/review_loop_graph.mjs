const LOCAL_END = Symbol.for("pi-review.loop-graph.end");

function defaultAgentExecute(options = {}) {
  return async (_instance, input) => ({
    nodeId: "",
    status: "ok",
    result: {
      prompt: typeof options.prompt === "function" ? options.prompt(input) : options.prompt || "",
      input: input.data,
    },
  });
}

function completionFrame(summary, completion) {
  return {
    nodeId: completion.nodeId,
    status: completion.status,
    summary,
    result: completion.result || {},
  };
}

function passInput(completion) {
  return completion.result || {};
}

export function createReviewSingleTurnGraph(sdk = {}) {
  const END = sdk.END || LOCAL_END;
  const createAgentExecute = sdk.createAgentExecute || defaultAgentExecute;

  const prepareReviewTurn = {
    kind: "code",
    id: "prepare_review_turn",
    subGoal: "校验单题复习输入，并决定是否需要先展示资料",
    async execute(_instance, input) {
      const data = input.data || {};
      const mode = String(data.mode || "practice");
      return {
        nodeId: "prepare_review_turn",
        status: data.subject_id ? "ok" : "failed",
        result: {
          ...data,
          mode,
          needs_material: mode === "card_practice" || mode === "chapter_study" || Boolean(data.chapter_id),
        },
      };
    },
  };

  const showMaterial = {
    kind: "code",
    id: "show_material",
    subGoal: "按模式调用资料展示工具，确保出题前先展示必要材料",
    tools: ["review_card", "review_exam_points", "review_chapter"],
    execute: createAgentExecute({
      prompt(input) {
        return [
          "根据当前单题复习输入调用恰当的资料展示工具。",
          "card_practice 使用 review_card；chapter_study 使用 review_chapter；practice 有 chapter_id 时使用 review_exam_points。",
          "工具返回 practice 后，调用 __graph_complete__，result 保留 subject_id、mode、chapter_id、knowledge_point_id、difficulty、question_type。",
          `当前输入: ${JSON.stringify(input.data)}`,
        ].join("\n");
      },
      tools: ["review_card", "review_exam_points", "review_chapter"],
    }),
  };

  const generateQuestion = {
    kind: "code",
    id: "generate_question",
    subGoal: "生成一道符合当前资料、知识点、题型和难度约束的结构化题目",
    skill: "review-question",
    execute: createAgentExecute({
      skill: "review-question",
      prompt(input) {
        return [
          "生成一道结构化复习题，但不要直接向用户展示。",
          "完成后调用 __graph_complete__，result.question 必须包含 type、question_text、knowledge_points、difficulty、correct_answer、explanation_l1、source_basis。",
          `当前输入: ${JSON.stringify(input.data)}`,
        ].join("\n");
      },
      validateCompletion(result) {
        const question = result.question;
        if (!question || typeof question !== "object") return { isValid: false, reason: "result.question 缺失" };
        if (!question.type || !question.question_text) return { isValid: false, reason: "question.type 或 question.question_text 缺失" };
        return { isValid: true };
      },
    }),
  };

  const answerQuestion = {
    kind: "code",
    id: "answer_question",
    subGoal: "调用 review_answer 展示题目并收集用户答案",
    tools: ["review_answer"],
    execute: createAgentExecute({
      prompt(input) {
        return [
          "调用 review_answer 展示 result.question 并收集用户答案。",
          "用户提交答案后调用 __graph_complete__，result 必须包含 question 和 user_answer。",
          `当前输入: ${JSON.stringify(input.data)}`,
        ].join("\n");
      },
      tools: ["review_answer"],
      validateCompletion(result) {
        if (!result.question) return { isValid: false, reason: "result.question 缺失" };
        if (typeof result.user_answer !== "string") return { isValid: false, reason: "result.user_answer 缺失" };
        return { isValid: true };
      },
    }),
  };

  const gradeAnswer = {
    kind: "code",
    id: "grade_answer",
    subGoal: "判定用户答案并给出解释",
    skill: "review-grade",
    execute: createAgentExecute({
      skill: "review-grade",
      prompt(input) {
        return [
          "根据 review-grade 规则判题。",
          "完成后调用 __graph_complete__，result 必须包含 question、user_answer、is_correct、grading、explanation_l1。",
          `当前输入: ${JSON.stringify(input.data)}`,
        ].join("\n");
      },
      validateCompletion(result) {
        if (typeof result.is_correct !== "boolean") return { isValid: false, reason: "result.is_correct 必须是 boolean" };
        if (!result.question || typeof result.user_answer !== "string") return { isValid: false, reason: "question 或 user_answer 缺失" };
        return { isValid: true };
      },
    }),
  };

  const archiveTurn = {
    kind: "code",
    id: "archive_turn",
    subGoal: "调用 review_archive 归档已判题目",
    tools: ["review_archive"],
    execute: createAgentExecute({
      prompt(input) {
        return [
          "必须调用 review_archive 归档本题结果。",
          "归档完成后调用 __graph_complete__，result 保留 question、user_answer、is_correct、archive_status。",
          `当前输入: ${JSON.stringify(input.data)}`,
        ].join("\n");
      },
      tools: ["review_archive"],
    }),
  };

  const chooseTurnAction = {
    kind: "code",
    id: "choose_turn_action",
    subGoal: "调用 review_turn_action 获取题后动作",
    tools: ["review_turn_action"],
    execute: createAgentExecute({
      prompt(input) {
        return [
          "调用 review_turn_action 获取用户下一步动作。",
          "完成后调用 __graph_complete__，result 必须包含 action。",
          `当前输入: ${JSON.stringify(input.data)}`,
        ].join("\n");
      },
      tools: ["review_turn_action"],
      validateCompletion(result) {
        return typeof result.action === "string"
          ? { isValid: true }
          : { isValid: false, reason: "result.action 缺失" };
      },
    }),
  };

  const edge = (id, from, to, summary, options = {}) => ({
    id,
    from,
    to,
    priority: options.priority || 10,
    guard: options.guard || ((completion) => completion.status === "ok"),
    migrate(_instance, completion) {
      return {
        frame: completionFrame(summary, completion),
        input: options.input ? options.input(completion) : passInput(completion),
      };
    },
  });

  return {
    id: "review_single_turn",
    goal: "执行一轮结构化复习单题流程，并确保归档和题后动作发生",
    invocation: {
      name: "review-turn",
      description: "运行一轮 Loop Graph 单题复习流程",
      inputSchema: {
        type: "object",
        properties: {
          subject_id: { type: "string" },
          mode: { type: "string" },
          chapter_id: { type: "string" },
          knowledge_point_id: { type: "string" },
          difficulty: { type: "string" },
          question_type: { type: "string" },
        },
        required: ["subject_id"],
      },
      parseArgs(args) {
        const [subject_id, mode = "practice", chapter_id = ""] = String(args || "").trim().split(/\s+/);
        return { subject_id, mode, chapter_id };
      },
    },
    entries: [{
      id: "review_turn_entry",
      guard: (background) => Boolean(background.subject_id),
      startNodeId: "prepare_review_turn",
      mapInput: (background) => background,
    }],
    nodes: {
      prepare_review_turn: prepareReviewTurn,
      show_material: showMaterial,
      generate_question: generateQuestion,
      answer_question: answerQuestion,
      grade_answer: gradeAnswer,
      archive_turn: archiveTurn,
      choose_turn_action: chooseTurnAction,
    },
    routing: {
      prepare_review_turn: {
        nodeId: "prepare_review_turn",
        router: { kind: "priority-first" },
        edges: [
          edge("prepare_to_material", "prepare_review_turn", "show_material", "单题输入需要先展示资料", {
            priority: 20,
            guard: (completion) => completion.status === "ok" && completion.result.needs_material === true,
          }),
          edge("prepare_to_question", "prepare_review_turn", "generate_question", "单题输入可直接出题", {
            priority: 10,
            guard: (completion) => completion.status === "ok",
          }),
        ],
      },
      show_material: {
        nodeId: "show_material",
        router: { kind: "priority-first" },
        edges: [edge("material_to_question", "show_material", "generate_question", "资料已展示，进入出题")],
      },
      generate_question: {
        nodeId: "generate_question",
        router: { kind: "priority-first" },
        edges: [edge("question_to_answer", "generate_question", "answer_question", "题目已生成，进入答题")],
      },
      answer_question: {
        nodeId: "answer_question",
        router: { kind: "priority-first" },
        edges: [edge("answer_to_grade", "answer_question", "grade_answer", "用户已作答，进入判题")],
      },
      grade_answer: {
        nodeId: "grade_answer",
        router: { kind: "priority-first" },
        edges: [edge("grade_to_archive", "grade_answer", "archive_turn", "判题完成，必须归档")],
      },
      archive_turn: {
        nodeId: "archive_turn",
        router: { kind: "priority-first" },
        edges: [edge("archive_to_action", "archive_turn", "choose_turn_action", "归档完成，进入题后动作")],
      },
      choose_turn_action: {
        nodeId: "choose_turn_action",
        router: { kind: "priority-first" },
        edges: [edge("action_to_end", "choose_turn_action", END, "题后动作完成，结束单题回路")],
      },
    },
  };
}

export const reviewSingleTurnGraph = createReviewSingleTurnGraph();
