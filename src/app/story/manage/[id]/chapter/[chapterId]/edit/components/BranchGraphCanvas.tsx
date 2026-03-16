'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import styles from '../edit.module.css';
import type { BranchChoiceDraft, BranchGraphEdge, BranchGraphNode, BranchGraphSelection, BranchTargetOption } from './types';

type BranchGraphCanvasProps = {
  nodes: BranchGraphNode[];
  edges: BranchGraphEdge[];
  selected: BranchGraphSelection;
  onSelect: (selection: BranchGraphSelection) => void;
  /** Fill available container space (used in expanded modal) */
  fillViewport?: boolean;
  /** Show inline selection popover inside graph */
  showSelectionPopover?: boolean;
  /** Interactive editing callbacks */
  onUpdateChoice?: (id: string, updates: Partial<BranchChoiceDraft>) => void;
  onRemoveChoice?: (id: string) => void;
  onAddChoice?: () => void;
  onDuplicateChoice?: (id: string) => void;
  onOpenTarget?: (id: string) => void;
  chapterChoices?: BranchChoiceDraft[];
  chapterTargets?: BranchTargetOption[];
  getChoiceTargets?: (choiceId: string) => BranchTargetOption[];
  currentChapterId?: string;
  maxChoices?: number;
  minChoices?: number;
  choiceCount?: number;
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;
const CANVAS_PADDING = 32;

function isNodeSelected(node: BranchGraphNode, selected: BranchGraphSelection): boolean {
  if (!node.selection || !selected) return false;
  return node.selection.type === selected.type && node.selection.id === selected.id;
}

export function BranchGraphCanvas({
  nodes,
  edges,
  selected,
  onSelect,
  fillViewport = false,
  showSelectionPopover = true,
  onUpdateChoice,
  onRemoveChoice,
  onAddChoice,
  onDuplicateChoice,
  onOpenTarget,
  chapterChoices = [],
  chapterTargets = [],
  getChoiceTargets,
  currentChapterId = '',
  maxChoices = 4,
  minChoices = 0,
  choiceCount = 0,
}: BranchGraphCanvasProps) {
  const [hoveredChoiceId, setHoveredChoiceId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showTargetDropdown, setShowTargetDropdown] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const isInteractive = !!(onUpdateChoice && onRemoveChoice && onAddChoice);

  const nodeById = useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  const dimensions = useMemo(() => {
    const maxX = nodes.reduce((max, node) => Math.max(max, node.x), 0);
    const maxY = nodes.reduce((max, node) => Math.max(max, node.y), 0);

    return {
      width: maxX + NODE_WIDTH + CANVAS_PADDING,
      height: maxY + NODE_HEIGHT + CANVAS_PADDING,
    };
  }, [nodes]);

  useEffect(() => {
    if (!fillViewport) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(viewport);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fillViewport]);

  const renderDimensions = useMemo(() => {
    if (!fillViewport) return dimensions;
    return {
      width: Math.max(dimensions.width, viewportSize.width),
      height: Math.max(dimensions.height, viewportSize.height),
    };
  }, [dimensions, fillViewport, viewportSize.height, viewportSize.width]);

  const activeChoiceId = hoveredChoiceId ?? (selected?.type === 'choice' ? selected.id : null);

  // Focus inline input when editing starts
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  // Close target dropdown when clicking outside
  useEffect(() => {
    if (!showTargetDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTargetDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTargetDropdown]);

  const handleDoubleClick = useCallback((node: BranchGraphNode) => {
    if (!isInteractive) return;
    if (node.kind !== 'choice' || !node.choiceId) return;
    setEditingNodeId(node.id);
    setEditingText(node.label);
    setShowTargetDropdown(null);
  }, [isInteractive]);

  const commitEdit = useCallback(() => {
    if (!editingNodeId || !onUpdateChoice) return;
    // Extract choiceId from node id (format: "choice:uuid")
    const choiceId = editingNodeId.replace('choice:', '');
    onUpdateChoice(choiceId, { choiceText: editingText });
    setEditingNodeId(null);
    setEditingText('');
  }, [editingNodeId, editingText, onUpdateChoice]);

  const cancelEdit = useCallback(() => {
    setEditingNodeId(null);
    setEditingText('');
  }, []);

  const handleNodeClick = useCallback((node: BranchGraphNode) => {
    if (editingNodeId) return; // Don't interfere with editing
    const selection = node.selection ?? null;
    onSelect(selection);

    // Toggle target dropdown for choice nodes
    if (isInteractive && node.kind === 'choice' && node.choiceId) {
      setShowTargetDropdown((prev) => prev === node.choiceId ? null : node.choiceId!);
    } else {
      setShowTargetDropdown(null);
    }
  }, [editingNodeId, onSelect, isInteractive]);

  const handleTargetSelect = useCallback((choiceId: string, targetId: string) => {
    if (!onUpdateChoice) return;
    onUpdateChoice(choiceId, { toChapterId: targetId || null });
    setShowTargetDropdown(null);
  }, [onUpdateChoice]);

  const handleDeleteChoice = useCallback((e: React.MouseEvent, choiceId: string) => {
    e.stopPropagation();
    if (!onRemoveChoice) return;
    onRemoveChoice(choiceId);
    setShowTargetDropdown(null);
    setEditingNodeId(null);
  }, [onRemoveChoice]);

  return (
    <div
      ref={viewportRef}
      className={`${styles.branchGraphViewport} ${fillViewport ? styles.branchGraphViewportFill : ''}`}
    >
      <div
        className={`${styles.branchGraphCanvas} ${fillViewport ? styles.branchGraphCanvasFill : ''}`}
        style={{ width: renderDimensions.width, height: renderDimensions.height }}
      >
        <svg
          className={styles.branchGraphEdgesSvg}
          width={renderDimensions.width}
          height={renderDimensions.height}
          viewBox={`0 0 ${renderDimensions.width} ${renderDimensions.height}`}
          role="presentation"
        >
          {edges.map((edge) => {
            const fromNode = nodeById.get(edge.from);
            const toNode = nodeById.get(edge.to);
            if (!fromNode || !toNode) return null;

            const x1 = fromNode.x + NODE_WIDTH;
            const y1 = fromNode.y + NODE_HEIGHT / 2;
            const x2 = toNode.x;
            const y2 = toNode.y + NODE_HEIGHT / 2;
            const c1x = x1 + 96;
            const c2x = x2 - 96;
            const path = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;

            const isEdgeActive = !!activeChoiceId && edge.choiceId === activeChoiceId;
            const lineClass = [
              styles.branchGraphEdge,
              edge.isMissing ? styles.branchGraphEdgeMissing : '',
              isEdgeActive ? styles.branchGraphEdgeActive : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <g key={edge.id}>
                <path className={lineClass} d={path} />
                {edge.label && (
                  <text
                    className={styles.branchGraphEdgeLabel}
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 6}
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const selectedNode = isNodeSelected(node, selected);
          const isHovered = node.choiceId && hoveredChoiceId === node.choiceId;
          const isEditing = editingNodeId === node.id;
          const isChoiceNode = node.kind === 'choice' && !!node.choiceId;
          const showDelete = isInteractive && isChoiceNode && (isHovered || selectedNode) && !isEditing && (choiceCount > (minChoices ?? 0));
          const fullChoiceDef = isChoiceNode ? chapterChoices.find(c => c.id === node.choiceId) : null;
          const availableTargets = node.choiceId
            ? (getChoiceTargets?.(node.choiceId) ?? chapterTargets.filter((t) => t.id !== currentChapterId))
            : [];

          const nodeClass = [
            styles.branchGraphNode,
            styles[`branchGraphNodeKind${node.kind[0].toUpperCase()}${node.kind.slice(1)}`],
            styles[`branchGraphNodeStatus${node.status[0].toUpperCase()}${node.status.slice(1)}`],
            selectedNode ? styles.branchGraphNodeSelected : '',
            isHovered ? styles.branchGraphNodeHovered : '',
            isInteractive && (isChoiceNode || node.kind === 'target') ? styles.branchGraphNodeInteractive : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={node.id} style={{ position: 'absolute', left: node.x, top: node.y }}>
              <div
                role="button"
                tabIndex={0}
                className={nodeClass}
                style={{ width: NODE_WIDTH, height: NODE_HEIGHT, position: 'relative' }}
                onClick={() => handleNodeClick(node)}
                onDoubleClick={() => handleDoubleClick(node)}
                onMouseEnter={() => setHoveredChoiceId(node.choiceId || null)}
                onMouseLeave={() => setHoveredChoiceId((prev) => (prev === node.choiceId ? null : prev))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNodeClick(node);
                }}
              >
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    className={styles.branchGraphNodeInlineInput}
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                    }}
                    onBlur={commitEdit}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className={styles.branchGraphNodeLabel}>{node.label}</span>
                    {node.subtitle && <span className={styles.branchGraphNodeSubtitle}>{node.subtitle}</span>}
                  </>
                )}

                {/* Delete button */}
                {showDelete && node.choiceId && (
                  <button
                    type="button"
                    className={styles.branchGraphNodeDeleteBtn}
                    onClick={(e) => handleDeleteChoice(e, node.choiceId!)}
                    title="ลบทางเลือกนี้"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {/* Target dropdown below the node */}
              {isInteractive && isChoiceNode && showTargetDropdown === node.choiceId && !selectedNode && (
                <div
                  ref={dropdownRef}
                  className={styles.branchGraphNodeTargetDropdown}
                  style={{ width: NODE_WIDTH }}
                >
                  <div className={styles.branchGraphDropdownLabel}>เลือกตอนปลายทาง:</div>
                  {availableTargets.map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        className={styles.branchGraphDropdownItem}
                        onClick={() => handleTargetSelect(node.choiceId!, target.id)}
                      >
                        ตอน {target.orderIndex + 1}: {target.title}
                      </button>
                    ))}
                  {availableTargets.length === 0 && (
                    <div className={styles.branchGraphDropdownEmpty}>ยังไม่มีตอนอื่นให้เลือก</div>
                  )}
                </div>
              )}

              {/* Details Popover when node is selected */}
              {selectedNode && isInteractive && showSelectionPopover && (
                <div className={styles.branchGraphNodePopover} style={{ left: NODE_WIDTH + 24, top: 0 }}>
                  {node.kind === 'choice' && fullChoiceDef && (
                    <div className={styles.branchPopoverContent}>
                      <div className={styles.branchPopoverHeader}>
                        <h4>รายละเอียดทางเลือก</h4>
                      </div>
                      <div className={styles.branchPopoverField}>
                        <span>💭 Consequence Hint (แสดงเมื่อผู้อ่าน hover)</span>
                        <textarea
                          className={styles.branchInspectorTextarea}
                          value={fullChoiceDef.outcomeText}
                          onChange={(e) => onUpdateChoice?.(fullChoiceDef.id, { outcomeText: e.target.value })}
                          placeholder="คำใบ้ผลลัพธ์ที่จะเกิดขึ้น..."
                          rows={3}
                        />
                      </div>
                      
                      {(!fullChoiceDef.choiceText || !fullChoiceDef.toChapterId) && (
                        <div className={styles.branchPopoverIssues}>
                          {!fullChoiceDef.choiceText && <div>⚠️ ต้องใส่ข้อความทางเลือก (Double-click ที่โหนด)</div>}
                          {!fullChoiceDef.toChapterId && <div>⚠️ ยังไม่ได้เชื่อมต่อตอนปลายทาง (คลิกที่โหนดเพื่อเลือก)</div>}
                        </div>
                      )}
                      
                      <div className={styles.branchPopoverActions}>
                        <button
                          type="button"
                          className={styles.branchInspectorActionBtn}
                          onClick={() => onDuplicateChoice?.(fullChoiceDef.id)}
                        >
                          ทำซ้ำ
                        </button>
                      </div>
                    </div>
                  )}

                  {node.kind === 'target' && (
                    <div className={styles.branchPopoverContent}>
                      <div className={styles.branchPopoverHeader}>
                        <h4>ข้อมูลตอนปลายทาง</h4>
                      </div>
                      <div className={styles.branchPopoverInfo}>
                         สถานะ: {node.status === 'published_target' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
                      </div>
                      <div className={styles.branchPopoverActions}>
                        <button
                          type="button"
                          className={styles.branchInspectorActionBtn}
                          onClick={() => {
                            const targetId = node.id.replace('target:', '');
                            onOpenTarget?.(targetId);
                          }}
                        >
                          แก้ไขตอนปลายทาง (Modal)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add choice button next to current node */}
        {isInteractive && (() => {
          const currentNode = nodes.find((n) => n.kind === 'current');
          if (!currentNode) return null;
          const btnY = currentNode.y + NODE_HEIGHT + 12;
          return (
            <button
              type="button"
              className={styles.branchGraphAddBtn}
              style={{ position: 'absolute', left: currentNode.x, top: btnY }}
              onClick={onAddChoice}
              disabled={choiceCount >= maxChoices}
              title={choiceCount >= maxChoices ? `สูงสุด ${maxChoices} ทางเลือก` : 'เพิ่มทางเลือกใหม่'}
            >
              <Plus size={14} />
              เพิ่มทางเลือก
            </button>
          );
        })()}
      </div>
    </div>
  );
}
