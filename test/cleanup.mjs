export async function removeTestCaptures(db, captureIds, preservedExpressionIds) {
  await db.$transaction(async tx => {
    const candidates = await tx.candidate.findMany({ where: { revision: { captureId: { in: captureIds } } } });
    const ids = candidates.map(row => row.id);
    const records = await tx.learningRecord.findMany({ where: { candidateId: { in: ids } } });
    const expressions = [...new Set(records.map(row => row.expressionId))]
      .filter(id => !preservedExpressionIds.has(id));
    await tx.commandReceipt.deleteMany({ where: { candidateId: { in: ids } } });
    await tx.learningRecord.deleteMany({ where: { candidateId: { in: ids } } });
    // A fixture can reuse an expression; only remove new, unreferenced expressions.
    const unreferenced = await tx.expression.findMany({
      where: { id: { in: expressions }, learningRecords: { none: {} } }, select: { id: true },
    });
    const removable = unreferenced.map(row => row.id);
    await tx.expressionForm.deleteMany({ where: { expressionId: { in: removable } } });
    await tx.expression.deleteMany({ where: { id: { in: removable } } });
    await tx.candidate.deleteMany({ where: { id: { in: ids } } });
    await tx.captureRevision.deleteMany({ where: { captureId: { in: captureIds } } });
    await tx.capture.deleteMany({ where: { id: { in: captureIds } } });
  });
}
