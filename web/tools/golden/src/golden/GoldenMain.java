package golden;

import java.io.OutputStream;
import java.io.PrintStream;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import mallorcatour.equilator.preflop.PreflopEquilatorImpl;
import mallorcatour.equilator.preflop.PreflopStrengthTable;

public final class GoldenMain {

	private static final int HAND_CLASSES = 169;
	private static final double UNUSED = -1;
	private static final int MIN_DECISIONS_PER_STREET = 40;
	private static final int MIN_DECISIONS = 200;
	private static final int MAX_GAMES = 500;

	private GoldenMain() {
	}

	public static void main(String[] args) throws Exception {
		Path web = Paths.get(args[0]).toAbsolutePath().normalize();
		PrintStream report = System.err;
		System.setOut(new PrintStream(new OutputStream() {
			@Override
			public void write(int b) {
			}
		}));

		Json.write(web.resolve("src/brains/fixtures/preflop-strength-java.json"), preflopTable(report));
		report.println("preflop-strength-java.json: " + HAND_CLASSES + "x" + HAND_CLASSES);

		DecisionHarness harness = new DecisionHarness();
		int seed = 1;
		while (!harness.enough(MIN_DECISIONS_PER_STREET, MIN_DECISIONS)) {
			if (seed > MAX_GAMES) {
				throw new IllegalStateException("Not enough decisions after " + MAX_GAMES + " games");
			}
			harness.playGame(seed++);
		}
		Json.write(web.resolve("src/brains/fixtures/decisions.json"), harness.decisions);
		report.println("decisions.json: " + harness.decisions.size() + " decisions " + harness.decisionsByStreet);
		report.println("games " + harness.gamesPlayed + ", hands " + harness.handsPlayed + ", hands dropped "
				+ harness.handsDropped + ", decisions dropped " + harness.decisionsDropped + ", illegal chosen "
				+ harness.illegalChosen + ", games stopped by the blind schedule "
				+ harness.gamesStoppedByBlindSchedule);
		report.println("action classes " + harness.actionClasses);
		report.println("chosen " + harness.chosenKinds);
		for (String note : harness.notes) {
			report.println("note: " + note);
		}
	}

	private static List<Object> preflopTable(PrintStream report) {
		double[][] table = new PreflopEquilatorImpl().preflopStrength;
		if (table != PreflopStrengthTable.array) {
			throw new IllegalStateException("PreflopEquilatorImpl does not use PreflopStrengthTable.array");
		}
		double[][] fromFile = ((PreflopEquilatorImpl) PreflopEquilatorImpl.createFromFile()).preflopStrength;
		double maxDifference = 0;
		for (int i = 0; i < table.length; i++) {
			for (int j = 0; j < table[i].length; j++) {
				maxDifference = Math.max(maxDifference, Math.abs(table[i][j] - fromFile[i][j]));
			}
		}
		report.println("preflop.eql equals PreflopStrengthTable.array: " + Arrays.deepEquals(table, fromFile)
				+ ", max difference " + maxDifference);
		for (int i = 0; i < table.length; i++) {
			for (int j = 0; j < table[i].length; j++) {
				if ((i >= HAND_CLASSES || j >= HAND_CLASSES) && table[i][j] != UNUSED) {
					throw new IllegalStateException("Unexpected value outside 169x169 at " + i + "," + j);
				}
			}
		}
		List<Object> rows = new ArrayList<>();
		for (int i = 0; i < HAND_CLASSES; i++) {
			List<Object> row = new ArrayList<>();
			for (int j = 0; j < HAND_CLASSES; j++) {
				row.add(table[i][j]);
			}
			rows.add(row);
		}
		return rows;
	}
}
