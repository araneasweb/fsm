import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import tikzjaxJs from "./tikzjax.js?raw"; // For Vite (bundler must support ?raw)
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/themes/prism.css";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-latex";
import "prismjs/components/prism-ada";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";

interface Transition {
  [symbol: string]: string[];
}

interface Transitions {
  [fromState: string]: Transition;
}

function getPermutations<T>(arr: T[]): T[][] {
  if (arr.length === 0) return [[]];
  return arr.flatMap((v, i) =>
    getPermutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [
      v,
      ...p,
    ]),
  );
}

function getPossibleGridSizes(n: number): number[][] {
  const result = [];

  // Find all pairs where rows * cols >= n
  // We'll go up to n for both dimensions as a reasonable limit
  for (let rows = 1; rows <= n; rows++) {
    for (let cols = 1; cols <= n; cols++) {
      // Only include the table if it can fit exactly n elements
      // or has just one empty cell (for cases like n=3 in a 2x2 table)
      if (rows * cols === n || rows * cols === n + 1) {
        result.push([rows, cols]);
      }
    }
  }
  return result;
}

function calculateTransitionCost(
  statePositions: Record<string, [number, number]>,
  transitions: Record<string, Record<string, string[]>>,
): number {
  let totalCost = 0;

  for (const fromState in transitions) {
    for (const symbol in transitions[fromState]) {
      for (const toState of transitions[fromState][symbol]) {
        if (fromState in statePositions && toState in statePositions) {
          const [x1, y1] = statePositions[fromState];
          const [x2, y2] = statePositions[toState];
          totalCost += Math.abs(x1 - x2) + Math.abs(y1 - y2);
        }
      }
    }
  }
  return totalCost;
}

function findOptimalStatePlacement(
  states: string[],
  initState: string,
  acceptingStates: string[],
  transitions: Record<string, Record<string, string[]>>,
  accToRight: boolean,
): string[][] {
  const n = states.length;
  const allPermutations = getPermutations(states);
  const availableGridSizes = getPossibleGridSizes(n);

  let bestGrid: string[][] = [];
  let minCost = Infinity;

  for (const [rows, cols] of availableGridSizes) {
    for (const perm of allPermutations) {
      const grid: string[][] = Array.from({ length: rows }, () =>
        Array(cols).fill(null),
      );
      const statePositions: Record<string, [number, number]> = {};

      // Place states in the grid row-wise
      for (let i = 0; i < perm.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        if (row < rows && col < cols) {
          grid[row][col] = perm[i];
          statePositions[perm[i]] = [row, col];
        }
      }

      // Ensure the initial state is in a leftmost column of some row
      if (!grid.some((row) => row[0] === initState)) continue;

      // Handle accToRight constraint
      if (accToRight) {
        if (
          !grid.every((row) => {
            const rightmost = row.findLastIndex((cell) => cell !== null);
            return rightmost === -1 || acceptingStates.includes(row[rightmost]);
          }) &&
          grid.some((row) => {
            const rightmost = row.findLastIndex((cell) => cell !== null);
            return (
              rightmost !== -1 &&
              row
                .slice(0, rightmost)
                .some(
                  (cell) =>
                    acceptingStates.includes(cell) && cell !== initState,
                )
            );
          })
        )
          continue;
      }

      // Calculate transition cost
      const cost = calculateTransitionCost(statePositions, transitions);
      if (cost < minCost) {
        minCost = cost;
        bestGrid = grid;
      }
    }
  }

  return bestGrid.filter((row) => row.some((cell) => cell !== null));
}

function bendDirection(
  fromState: string,
  toState: string,
  grid: string[][],
): string[] {
  const [fromRow, fromCol] = grid.reduce(
    (acc, row, rowIndex) => {
      const colIndex = row.indexOf(fromState);
      if (colIndex !== -1) {
        acc = [rowIndex, colIndex];
      }
      return acc;
    },
    [-1, -1],
  );
  const [toRow, toCol] = grid.reduce(
    (acc, row, rowIndex) => {
      const colIndex = row.indexOf(toState);
      if (colIndex !== -1) {
        acc = [rowIndex, colIndex];
      }
      return acc;
    },

    [-1, -1],
  );
  if (fromRow === toRow && fromRow === 0) {
    return fromCol < toCol ? ["left", "above"] : ["right", "above"];
  } else if (fromRow === toRow && fromRow === grid.length - 1) {
    return fromCol < toCol ? ["right", "below"] : ["left", "below"];
  } else if (fromCol === toCol && fromCol === 0) {
    return fromRow < toRow ? ["right", "right"] : ["left", "left"];
  } else if (fromCol === toCol && fromCol === grid[0].length - 1) {
    return fromRow < toRow ? ["left", "right"] : ["right", "left"];
  }
  return fromCol < toCol ? ["right", "right"] : ["left", "left"];
}

function formatSymbol(symbol: string, style: string): string {
  if (style === "italic") {
    return `$${symbol}$`;
  } else if (style === "mono") {
    // monospace
    return `\\texttt{${symbol}}`;
  }
  return symbol;
}

const Generator: React.FC = () => {
  const [states, setStates] = useState<string>("q1, q2, q3, q4");
  const [initialState, setInitialState] = useState<string>("q1");
  const [acceptingStates, setAcceptingStates] = useState<string>("q3,q2");
  const [transitions, setTransitions] = useState<string>(
    "q3, 1, q2;\nq1, 0, 1, q1;\nq1, 1, q2;\nq2, 0, 1, q3;\nq3, 0, 1, q4;\nq4, 0, 1, q4;\nq2, 1, q4;",
  );
  // style options
  const [nodeDistance, setNodeDistance] = useState<number>(120);
  const [innerSep, setInnerSep] = useState<number>(4);
  const [bendAngle, setBendAngle] = useState<number>(30);
  const [shorten, setShorten] = useState<number>(3);
  const [initialText, setInitialText] = useState<string>("start");
  const [initialWhere, setInitialWhere] = useState<string>("left");
  const [acceptingBy, setAcceptingBy] = useState<string>("accepting by double");
  const [doubleDistance, setDoubleDistance] = useState<number>(1.5);
  const [arrowType, setArrowType] = useState<string>("Stealth[round]");
  const [symbolsStyle, setSymbolsStyle] = useState<string>("mono");
  // colors
  const [nodeFillColor, setNodeFillColor] = useState<string | null>("f0f0f0");
  const [nodeBorderColor, setNodeBorderColor] = useState<string | null>(null);
  const [edgeColor, setEdgeColor] = useState<string | null>(null);

  const [lineWidth, setLineWidth] = useState<string>("thick");
  const [tikzCode, setTikzCode] = useState<string>("");
  const tikzDiagramRef = useRef<HTMLDivElement>(null);

  // react-router-dom
  const location = useLocation();
  const nav = useNavigate();

  // Update input values based on URL parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setStates(params.get("states") || "q1, q2, q3, q4");
    setInitialState(params.get("initialState") || "q1");
    setAcceptingStates(params.get("acceptingStates") || "q3,q2");
    setTransitions(
      params.get("transitions") ||
        "q3, 1, q2;\nq1, 0, 1, q1;\nq1, 1, q2;\nq2, 0, 1, q3;\nq3, 0, 1, q4;\nq4, 0, 1, q4;\nq2, 1, q4;",
    );
  }, [location.search]);

  const statesToURL = () => {
    const params = new URLSearchParams();
    params.set("states", states);
    params.set("initialState", initialState);
    params.set("acceptingStates", acceptingStates);
    params.set("transitions", transitions);
    return params.toString();
  };

  // Update URL parameters based on input values
  const updateURL = () => {
    nav({ search: statesToURL() });
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      renderTikz(tikzCode);
      updateURL();
    }, 1000);
    return () => clearTimeout(handler);
  }, [tikzCode]);

  useEffect(() => {
    const script = document.createElement("script");
    script.id = "tikzjax";
    script.type = "text/javascript";
    script.innerText = tikzjaxJs;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const createTransitions = (transitionString: string): Transitions => {
    const transitionsList = transitionString
      .trim()
      .split(";")
      .filter((line) => line.trim() !== "");
    const transitions: Transitions = {};

    transitionsList.forEach((transition) => {
      const parts = transition
        .trim()
        .split(",")
        .map((part) => part.trim());
      const fromState = parts.shift() || "";
      const toState = parts.pop() || "";
      const symbols = parts;

      if (!transitions[fromState]) {
        transitions[fromState] = {};
      }
      if (!transitions[fromState][symbols.join(",")]) {
        transitions[fromState][symbols.join(",")] = [];
      }
      transitions[fromState][symbols.join(",")].push(toState);
    });

    return transitions;
  };

  const checkTransition = (
    transitions: Transitions,
    s1: string,
    s2: string,
  ): string[] | null => {
    let symbols: string[] = [];
    if (transitions[s1]) {
      for (const symbol in transitions[s1]) {
        if (transitions[s1][symbol].includes(s2)) {
          symbols.push(symbol);
        }
      }
    }
    symbols = symbols.map((s) => s.split(",")).flat();

    return symbols.length > 0 ? symbols.sort() : null;
  };

  const checkConnection = (
    transitions: Transitions,
    stateA: string,
    stateB: string,
  ) => {
    if (
      checkTransition(transitions, stateA, stateB) &&
      checkTransition(transitions, stateB, stateA)
    ) {
      return 2;
    } else if (
      checkTransition(transitions, stateA, stateB) ||
      checkTransition(transitions, stateB, stateA)
    ) {
      return 1;
    }
    return 0;
  };

  const getEdge = (grid: string[][], item: string): string | null => {
    // Iterate over the grid to find the position of the item
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        if (grid[i][j] === item) {
          // Check for each direction (top, bottom, left, right)

          // Top edge
          if (i === 0 || grid[i - 1][j] === null) {
            return "above";
          }
          // Bottom edge
          if (i === grid.length - 1 || grid[i + 1][j] === null) {
            return "below";
          }
          // Left edge
          if (j === 0 || grid[i][j - 1] === null) {
            return "left";
          }
          // Right edge
          if (j === grid[i].length - 1 || grid[i][j + 1] === null) {
            return "right";
          }
        }
      }
    }
    return null; // Return null if item not found
  };

  const doesLineCrossOtherElements = (
    arr2d: string[][],
    e1: string,
    e2: string,
  ): boolean => {
    const findPosition = (element: string): [number, number] | null => {
      for (let i = 0; i < arr2d.length; i++) {
        for (let j = 0; j < arr2d[i].length; j++) {
          if (arr2d[i][j] === element) {
            return [i, j];
          }
        }
      }
      return null;
    };

    const pos1 = findPosition(e1);
    const pos2 = findPosition(e2);

    if (!pos1 || !pos2) return false;

    const [x1, y1] = pos1;
    const [x2, y2] = pos2;

    // Check all elements between (x1, y1) and (x2, y2)
    for (let i = 0; i < arr2d.length; i++) {
      for (let j = 0; j < arr2d[i].length; j++) {
        if ((i === x1 && j === y1) || (i === x2 && j === y2)) continue; // Skip e1 and e2

        // Check if (i, j) is on the line passing through (x1, y1) and (x2, y2)
        if ((x2 - x1) * (j - y1) === (y2 - y1) * (i - x1)) {
          // Check if the point (i, j) is between (x1, y1) and (x2, y2)
          if (
            Math.min(x1, x2) <= i &&
            i <= Math.max(x1, x2) &&
            Math.min(y1, y2) <= j &&
            j <= Math.max(y1, y2)
          ) {
            return true; // Another element is crossed
          }
        }
      }
    }
    return false;
  };

  // check if two elements are next to each other in a 2d array (row-wise/col-wise/diagonal)
  // const areElementsNextToEachOther = (arr2d: string[][], e1: string, e2: string) => {
  //   const [r1, c1] = arr2d.reduce((acc, row, rowIndex) => {
  //     const colIndex = row.indexOf(e1);
  //     if (colIndex !== -1) {
  //       acc = [rowIndex, colIndex];
  //     }
  //     return acc;
  //   }, [-1, -1]);
  //   return false;
  // };

  const formatState = (str: string) => {
    const pattern = /^[A-Za-z](\d+)?$/; // Matches a letter followed by optional digits
    if (pattern.test(str) && str.length >= 2) {
      return `$${str[0]}_{${str.slice(1)}}$`; // Format as LaTeX
    }
    return `$${str}$`; // Default format
  };

  const generate = () => {
    const acceptingStatesArray = acceptingStates
      .split(",")
      .map((s) => s.trim());
    let code = "";
    code += `% Generated by ${window.location.origin + window.location.pathname}?${statesToURL()}\n`;
    code += `\\usepackage{tikz}\n\\usetikzlibrary{automata, arrows.meta, positioning}\n\\begin{document}\n`;

    if (nodeFillColor) {
      code += `\\definecolor{nodeFillColor}{HTML}{${nodeFillColor.replace("#", "")}}\n`;
    }
    if (nodeBorderColor) {
      code += `\\definecolor{nodeBorderColor}{HTML}{${nodeBorderColor.replace("#", "")}}\n`;
    }
    if (edgeColor) {
      code += `\\definecolor{edgeColor}{HTML}{${edgeColor.replace("#", "")}}\n`;
    }

    code += `\\begin{tikzpicture}`;

    // Style
    code += `[
      shorten >=${shorten}pt,
      bend angle=${bendAngle},
      inner sep=${innerSep}pt,
      ${lineWidth},
      node distance=${nodeDistance}pt,
      >={${arrowType}},
      ${initialWhere ? `initial text=${initialText},` : `initial text=,`}`;
    // every state/.style={
    //   draw=${nodeColor},
    //   fill=${nodeColor}!20},
    // `;

    if (nodeFillColor || nodeBorderColor) {
      code += `\nevery state/.style={`;
      if (nodeFillColor) {
        code += `fill=nodeFillColor,`;
      }
      if (nodeBorderColor) {
        code += `draw=nodeBorderColor,`;
      }
      code += `},\n`;
    }
    if (edgeColor) {
      code += `every edge/.style={draw=edgeColor},\n`;
    }

    if (acceptingBy === "accepting by double") {
      code += `accepting by double/.style={double, double distance=${doubleDistance}pt},\n`;
    } else {
      code += `accepting/.style=accepting by arrow,\n`;
    }

    code += `on grid]\n`;

    // Generate transitions
    const transitionsObj: Transitions = createTransitions(transitions);
    // console.log(transitionsObj);

    // Generate nodes
    const statesArray = states
      .split(/,|;/)
      .map((s) => s.trim())
      .filter((s) => s !== "");

    // Auto layout
    const optimalStatePlacement = findOptimalStatePlacement(
      statesArray,
      initialState,
      acceptingStatesArray,
      transitionsObj,
      acceptingBy === "accepting by arrow",
    );
    let previousRowFirstState: string | null = null;
    optimalStatePlacement.forEach((row, rowIndex) => {
      let previousState: string | null = null;
      row.forEach((state, colIndex) => {
        if (state) {
          let stateType =
            state == initialState
              ? `, initial${initialWhere ? ` ${initialWhere}` : ""}`
              : "";
          if (acceptingStatesArray.includes(state)) {
            stateType += ", accepting";
          }
          // statePositions[state] = [colIndex * 2, -rowIndex * 2];
          if (colIndex === 0 && rowIndex > 0 && previousRowFirstState) {
            code += `\t\\node[state${stateType}] (${state.replace("\\", "")}) [below of=${previousRowFirstState.replace("\\", "")}] {${formatState(state)}};\n`;
            previousRowFirstState = state;
          } else if (colIndex > 0 && previousState) {
            code += `\t\\node[state${stateType}] (${state.replace("\\", "")}) [right of=${previousState.replace("\\", "")}] {${formatState(state)}};\n`;
          } else {
            code += `\t\\node[state${stateType}] (${state.replace("\\", "")}) {${formatState(state)}};\n`;
            previousRowFirstState = state;
          }
          previousState = state;
        }
      });
    });

    const bendDirectionArray: string[][] = Array.from(
      { length: statesArray.length },
      () => Array(statesArray.length).fill(""),
    );
    statesArray.forEach((fromState, fromIndex) => {
      statesArray.forEach((toState, toIndex) => {
        // Loops
        if (
          fromState === toState &&
          checkTransition(transitionsObj, fromState, toState)
        ) {
          const loopPos = getEdge(optimalStatePlacement, fromState) || "below";
          code += `    \\draw (${fromState.replace("\\", "")}) edge[loop ${loopPos}, ->]`;
          code += `node[auto]{${checkTransition(
            transitionsObj,
            fromState,
            toState,
          )
            ?.map((symbol) => formatSymbol(symbol, symbolsStyle))
            .join(", ")}} (${fromState.replace("\\", "")});\n`;
          // Non-loops
        } else if (checkTransition(transitionsObj, fromState, toState)) {
          if (
            !doesLineCrossOtherElements(
              optimalStatePlacement,
              fromState,
              toState,
            ) &&
            checkConnection(transitionsObj, fromState, toState) === 1
          ) {
            code += `    \\draw (${fromState.replace("\\", "")}) edge [above, ->] node[auto]{${checkTransition(
              transitionsObj,
              fromState,
              toState,
            )
              ?.map((s) => formatSymbol(s, symbolsStyle))
              .join(", ")}} (${toState.replace("\\", "")});\n`;
          } else {
            const bD =
              bendDirectionArray[fromIndex][toIndex] ||
              bendDirection(fromState, toState, optimalStatePlacement)[0];
            bendDirectionArray[fromIndex][toIndex] = bD;
            bendDirectionArray[toIndex][fromIndex] = bD;
            code += `    \\draw (${fromState.replace("\\", "")}) edge[bend ${bD}, right, ->] `;
            code += `node[${bendDirection(fromState, toState, optimalStatePlacement)[1]}]{${checkTransition(
              transitionsObj,
              fromState,
              toState,
            )
              ?.map((s) => formatSymbol(s, symbolsStyle))
              .join(", ")}} (${toState.replace("\\", "")});\n`;
          }
        }
      });
    });

    code += `\\end{tikzpicture}\n\\end{document}`;
    setTikzCode(code);
  };

  const renderTikz = (code: string | null) => {
    if (!window.tikzjax) {
      console.error(window.tikzjax);
    }
    // In a real implementation, we'd need to handle TikZJax rendering here
    if (tikzDiagramRef.current && window.tikzjax) {
      // Clear previous diagram
      tikzDiagramRef.current.innerHTML = "";

      // Create a script element with the TikZ code
      const script = document.createElement("script");
      script.setAttribute("type", "text/tikz");
      script.setAttribute("data-show-console", "true");
      script.textContent = code;

      // Append the script to the diagram container
      tikzDiagramRef.current.appendChild(script);

      // Trigger TikZJax to render the diagram
      try {
        window.tikzjax.process(tikzDiagramRef.current);
      } catch (error) {
        console.error("Error rendering TikZ diagram:", error);
      }
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tikzCode).then(() => {
      const button = document.getElementById("copyToClipboard");
      if (button) {
        button.textContent = "Copied!";
        setTimeout(() => {
          button.textContent = "Copy to Clipboard";
        }, 2000);
      }
    });
  };

  const exportSVG = () => {
    const svg = document.querySelector("#tikzDiagram svg");
    if (svg) {
      let fontFaceRules = "";

      [...document.styleSheets].forEach((sheet) => {
        try {
          [...sheet.cssRules].forEach((rule) => {
            if (/cmr10|cmmi10/.test(rule.cssText))
              fontFaceRules += rule.cssText + "\n";
          });
        } catch (err) {
          /* Ignore errors for cross-origin stylesheets */
        }
      });

      const styleElement = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "style",
      );
      styleElement.textContent = fontFaceRules;
      svg.prepend(styleElement);

      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: "exported.svg",
      });

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }
  };

  return (
    <div className="container mx-auto p-2 max-w-3xl">
      <h1 className="font-bold text-center">
        Finite Automaton Diagram Generator
      </h1>
      <p className="text-center text-gray-500">
        Generate{" "}
        <a
          href="https://en.wikipedia.org/wiki/PGF/TikZ"
          target="_blank"
          rel="noopener noreferrer"
        >
          TikZ
        </a>{" "}
        (with{" "}
        <a
          href="https://tikz.dev/library-automata"
          target="_blank"
          rel="noopener noreferrer"
        >
          automata
        </a>{" "}
        library) code for a diagram of{" "}
        <a
          href="https://en.wikipedia.org/wiki/Finite-state_machine"
          target="_blank"
        >
          finite automaton
        </a>{" "}
        (DFA/NFA).
      </p>
      <hr className="my-4"></hr>
      <form className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="states">
              States: <code className="text-gray-600">state1, state2, ...</code>
            </label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="text"
              id="states"
              value={states}
              onChange={(e) => setStates(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="initialState">Initial State:</label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="text"
              id="initialState"
              value={initialState}
              onChange={(e) => setInitialState(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="acceptingStates">Accepting States:</label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="text"
              id="acceptingStates"
              value={acceptingStates}
              onChange={(e) => setAcceptingStates(e.target.value)}
            />
          </div>
        </div>
        <label htmlFor="transitions">
          Transitions:{" "}
          <code className="text-gray-600">
            fromState, symbol1, ... , toState; ...
          </code>
        </label>
        <Editor
          id="transitions-editor"
          className="w-full"
          value={transitions}
          onValueChange={(code) => setTransitions(code)}
          highlight={(code) => Prism.highlight(code, languages.ada, "ada")}
          padding={10}
          style={{
            fontFamily: "monospace",
            backgroundColor: "white",
            fontSize: 14,
          }}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold">Style Options:</h3>
          <div>
            <label htmlFor="nodeDistance">Node Distance:</label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="number"
              id="nodeDistance"
              value={nodeDistance}
              onChange={(e) => setNodeDistance(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="innerSep">Inner Sep:</label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="number"
              id="innerSep"
              value={innerSep}
              onChange={(e) => setInnerSep(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="bendAngle">Bend Angle:</label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="number"
              id="bendAngle"
              value={bendAngle}
              onChange={(e) => setBendAngle(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="shorten">Shorten:</label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="number"
              id="shorten"
              value={shorten}
              onChange={(e) => setShorten(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="initialText">Initial Text:</label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="text"
              id="initialText"
              value={initialText}
              onChange={(e) => setInitialText(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="initialWhere">Initial Where:</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-lg"
              id="initialWhere"
              value={initialWhere}
              onChange={(e) => setInitialWhere(e.target.value)}
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div>
            <label htmlFor="acceptingBy">Accepting By:</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-lg"
              id="acceptingBy"
              value={acceptingBy}
              onChange={(e) => setAcceptingBy(e.target.value)}
            >
              <option value="accepting by arrow">arrow</option>
              <option value="accepting by double">double</option>
            </select>
          </div>
          <div>
            <label htmlFor="doubleDistance">Double Distance:</label>
            <input
              className="w-full p-2 border border-gray-300 rounded-lg"
              type="number"
              step="0.5"
              min="0.0"
              id="doubleDistance"
              value={doubleDistance}
              onChange={(e) => setDoubleDistance(parseFloat(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="arrowType">Arrow Type:</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-lg"
              id="arrowType"
              value={arrowType}
              onChange={(e) => setArrowType(e.target.value)}
            >
              <option value="Stealth[round]">Stealth[round]</option>
              <option value="Latex">Latex</option>
            </select>
          </div>
          <div>
            <label htmlFor="nodeColor">Node Fill Color:</label>
            <input
              className="w-full border border-gray-300 rounded-lg"
              type="color"
              id="nodeFillColor"
              value={nodeFillColor || ""}
              onChange={(e) => setNodeFillColor(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="nodeBorderColor">Node Border Color:</label>
            <input
              className="w-full border border-gray-300 rounded-lg"
              type="color"
              id="nodeBorderColor"
              value={nodeBorderColor || ""}
              onChange={(e) => setNodeBorderColor(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="edgeColor">Edge Color:</label>
            <input
              className="w-full border border-gray-300 rounded-lg"
              type="color"
              id="edgeColor"
              value={edgeColor || ""}
              onChange={(e) => setEdgeColor(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="lineWidth">Line Width:</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-lg"
              id="lineWidth"
              value={lineWidth}
              onChange={(e) => setLineWidth(e.target.value)}
            >
              <option value="semithick">Semithick</option>
              <option value="thick">Thick</option>
              <option value="very thick">Very Thick</option>
            </select>
          </div>
          <div>
            <label htmlFor="symbolsStyle">Symbols Style:</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-lg"
              id="symbolsStyle"
              value={symbolsStyle}
              onChange={(e) => setSymbolsStyle(e.target.value)}
            >
              <option value="mono">mono (texttt)</option>
              <option value="roman">roamn</option>
              <option value="italic">italic</option>
            </select>
          </div>
        </div>
      </form>
      <div
        id="tikzDiagram"
        ref={tikzDiagramRef}
        className={`mt-6 p-4 bg-white shadow-md rounded-lg flex justify-center`}
      ></div>
      <div className="flex justify-center space-x-4 mt-4">
        <button
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 cursor-pointer"
          type="button"
          onClick={generate}
        >
          Generate
        </button>
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 cursor-pointer"
          type="button"
          id="copyToClipboard"
          onClick={copyToClipboard}
        >
          Copy Code to Clipboard
        </button>
        <button
          className="px-4 py-2 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 cursor-pointer"
          type="button"
          id="exportSVG"
          onClick={exportSVG}
        >
          Export SVG
        </button>
      </div>
      <Editor
        id="tikz-editor"
        className="mt-6"
        value={tikzCode}
        onValueChange={(code) => setTikzCode(code)}
        highlight={(code) => highlight(code, languages.latex, "latex")}
        padding={10}
        style={{ fontFamily: "monospace", backgroundColor: "white" }}
      />
      <footer className="text-center m-8 text-gray-500">
        <div>
          source code:{" "}
          <a
            href="https://github.com/araneasweb/fsm/"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/araneasweb/fsm
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Generator;
