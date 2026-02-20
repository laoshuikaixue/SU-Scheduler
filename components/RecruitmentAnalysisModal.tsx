import React, {useMemo, useState} from 'react';
import Modal from './Modal';
import {Student, Department} from '../types';
import {Users, TrendingUp, TrendingDown, AlertCircle, Calculator, UserPlus, Star} from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    students: Student[];
    onPreview: (plan: { deptATarget: number, deptBTarget: number }) => void;
}

// 部门定义
const DEPT_A = [Department.DISCIPLINE, Department.STUDY]; // 纪检、学习
const DEPT_B = [Department.CHAIRMAN, Department.ART, Department.CLUBS, Department.SPORTS]; // 主席、文宣、社联、体育

// 任务配置 (基于高三退休后的场景)
const TASKS_PER_GROUP = {
    // Dept A
    CLEANING: 5, // 室外1 + 室内2 + 迟到2 = 5 (高一高二均可)
    OUTDOOR: 3,
    EYE_AM: 4,    // 仅高一高二
    EYE_PM: 6,    // 全年级
    EVENING: 3,   // 避嫌
    
    // Dept B
    INDOOR: 5,
};

const RecruitmentAnalysisModal: React.FC<Props> = ({isOpen, onClose, students, onPreview}) => {
    const [numGroups, setNumGroups] = useState(3); // 默认3组

    // 1. 现有人员统计 (排除高三)
    const stats = useMemo(() => {
        const nonG3 = students.filter(s => s.grade !== 3);
        
        const count = {
            deptA: {
                total: 0,
                g1: 0,
                g2: 0,
                leaders: 0 // 组长计数（包含在total中）
            },
            deptB: {
                total: 0,
                g1: 0,
                g2: 0
            }
        };

        nonG3.forEach(s => {
            if (DEPT_A.includes(s.department)) {
                count.deptA.total++;
                if (s.grade === 1) count.deptA.g1++;
                if (s.grade === 2) count.deptA.g2++;
                
                // 组长单独统计（但仍计入total）
                if (s.isLeader) {
                    count.deptA.leaders++;
                }
            } else if (DEPT_B.includes(s.department)) {
                count.deptB.total++;
                if (s.grade === 1) count.deptB.g1++;
                if (s.grade === 2) count.deptB.g2++;
            }
        });

        return count;
    }, [students]);

    // 2. 需求计算（基于避嫌规则的精确分析）
    const needs = useMemo(() => {
        // --- DEPT A 计算 ---
        // 高三退休后的避嫌规则分析：
        // 
        // 必须由高一负责（每组）：
        // - 高二眼操上午：1个，高二眼操下午：1个，高二晚自习：1个
        // - 小计：3个/组 × 3组 = 9个任务 → 最少需要9个高一（每人1任务）
        //
        // 必须由高二负责（每组）：
        // - 高一眼操上午：1个，高一眼操下午：1个，高一晚自习：1个
        // - 小计：3个/组 × 3组 = 9个任务 → 最少需要9个高二（每人1任务）
        //
        // 高一或高二都可以（每组）：
        // - 包干区：5个，室外课间操：3个，高三眼操：2个，高三晚自习：1个
        // - 小计：11个/组 × 3组 = 33个任务
        //
        // 总任务数：9 + 9 + 33 = 51个任务（排除室内课间操）
        
        // 完全覆盖模式：基于max.json验证
        // 33人（高一20 + 高二13）→ 100%覆盖
        const maxTotal = Math.ceil(33 * numGroups / 3);
        const maxG1 = Math.ceil(20 * numGroups / 3);
        const maxG2 = maxTotal - maxG1;
        
        // 均衡模式：约85%覆盖率
        // 估算：需要至少18人（高一9 + 高二9）才能覆盖必须任务
        // 再加上部分灵活任务，约需要25人
        const balancedTotal = Math.ceil(25 * numGroups / 3);
        const balancedG1 = Math.ceil(15 * numGroups / 3);
        const balancedG2 = balancedTotal - balancedG1;
        
        // 最少模式：约70%覆盖率
        // 至少需要18人（高一9 + 高二9）才能覆盖必须任务
        // 但17人会导致某些必须任务无法分配
        const minTotal = Math.ceil(20 * numGroups / 3);
        const minG1 = Math.ceil(10 * numGroups / 3);
        const minG2 = minTotal - minG1;

        // --- DEPT B 计算 ---
        const minDeptBPerGroup = Math.ceil(5 / 2.5);
        const maxDeptBPerGroup = 5;
        const minDeptB = minDeptBPerGroup * numGroups;
        const maxDeptB = maxDeptBPerGroup * numGroups;
        
        return {
            deptA: { 
                min: minTotal,
                balanced: balancedTotal,
                max: maxTotal,
                gradeDistribution: {
                    min: { g1: minG1, g2: minG2 },
                    balanced: { g1: balancedG1, g2: balancedG2 },
                    max: { g1: maxG1, g2: maxG2 }
                }
            },
            deptB: { min: minDeptB, max: maxDeptB }
        };
    }, [numGroups]);

    // 3. 缺口分析
    const analysis = useMemo(() => {
        return {
            deptA: {
                min: Math.max(0, needs.deptA.min - stats.deptA.total),
                balanced: Math.max(0, needs.deptA.balanced - stats.deptA.total),
                max: Math.max(0, needs.deptA.max - stats.deptA.total)
            },
            deptB: {
                min: Math.max(0, needs.deptB.min - stats.deptB.total),
                max: Math.max(0, needs.deptB.max - stats.deptB.total)
            }
        };
    }, [needs, stats]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="高三退休后人力缺口分析"
            width="w-[800px]"
        >
            <div className="space-y-6">
                {/* 顶部控制栏 */}
                <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                            <Calculator size={24} />
                        </div>
                        <div>
                            <h4 className="font-bold text-blue-900">参数设置</h4>
                            <p className="text-sm text-blue-700">基于高三全部退休场景</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">计划轮换组数:</span>
                        <div className="flex bg-white rounded-md border border-gray-300 overflow-hidden">
                            {[3, 4, 5, 6].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setNumGroups(n)}
                                    className={`px-3 py-1.5 text-sm transition ${
                                        numGroups === n 
                                        ? 'bg-blue-600 text-white font-bold' 
                                        : 'hover:bg-gray-50 text-gray-600'
                                    }`}
                                >
                                    {n}组
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 组长信息卡片 (新增) */}
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-yellow-100 rounded text-yellow-600">
                            <Users size={18} />
                        </div>
                        <div>
                            <span className="font-bold text-yellow-900 text-sm">组长分配 (每组1人)</span>
                            <div className="text-xs text-yellow-700">仅负责课间操室外点位1</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <div>
                            <span className="text-gray-600">需求: </span>
                            <span className="font-bold">{numGroups} 人</span>
                        </div>
                        <div>
                            <span className="text-gray-600">现有: </span>
                            <span className="font-bold">{stats.deptA.leaders} 人</span>
                        </div>
                        <div className={`font-bold ${stats.deptA.leaders >= numGroups ? 'text-green-600' : 'text-red-600'}`}>
                            {stats.deptA.leaders >= numGroups ? '满足' : `缺 ${numGroups - stats.deptA.leaders} 人`}
                        </div>
                    </div>
                </div>

                {/* 核心分析卡片 */}
                <div className="grid grid-cols-2 gap-6">
                    {/* 部门 A: 纪检/学习 */}
                    <div className="border rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                纪检部 & 学习部
                            </h3>
                            <span className="text-xs px-2 py-1 bg-gray-200 rounded text-gray-600">任务重灾区</span>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                                <span>当前可用人数 (非高三):</span>
                                <span className="font-mono font-bold text-lg">{stats.deptA.total} 人</span>
                            </div>
                            <div className="text-xs text-gray-500 pl-2 border-l-2 border-gray-200">
                                其中 高二: {stats.deptA.g2} 人 (包干区主力)<br/>
                                其中 高一: {stats.deptA.g1} 人
                            </div>

                            <div className="pt-2 border-t border-dashed"></div>

                            <div className="space-y-3">
                                {/* 最少人数模式 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最少配置</span>
                                        <span className="font-bold text-red-600">{needs.deptA.min} 人</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        覆盖率约60-70%，建议高一{needs.deptA.gradeDistribution?.min.g1}人 + 高二{needs.deptA.gradeDistribution?.min.g2}人
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${stats.deptA.total >= needs.deptA.min ? 'bg-green-500' : 'bg-red-500'}`}
                                            style={{width: `${Math.min(100, (stats.deptA.total / needs.deptA.min) * 100)}%`}}
                                        ></div>
                                    </div>
                                    {analysis.deptA.min > 0 ? (
                                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <TrendingUp size={12}/> 缺口: {analysis.deptA.min} 人
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <TrendingDown size={12}/> 人员充足
                                        </p>
                                    )}
                                    
                                    <button
                                        onClick={() => onPreview({
                                            deptATarget: needs.deptA.min,
                                            deptBTarget: stats.deptB.total // 保持现有人数
                                        })}
                                        className="mt-2 w-full py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs rounded border border-red-200 transition flex items-center justify-center gap-1"
                                    >
                                        <Users size={12}/> 生成最少配置排班预览
                                    </button>
                                </div>

                                {/* 均衡模式 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">均衡配置 (推荐)</span>
                                        <span className="font-bold text-gray-800 text-lg">{needs.deptA.balanced} 人</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        覆盖率约85-90%，建议高一{needs.deptA.gradeDistribution?.balanced.g1}人 + 高二{needs.deptA.gradeDistribution?.balanced.g2}人
                                    </div>
                                    {analysis.deptA.balanced > 0 ? (
                                        <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                                            <TrendingUp size={12}/> 建议招聘: {analysis.deptA.balanced} 人
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <TrendingDown size={12}/> 人员充足
                                        </p>
                                    )}
                                    <button
                                        onClick={() => onPreview({
                                            deptATarget: needs.deptA.balanced,
                                            deptBTarget: stats.deptB.total // 保持现有人数
                                        })}
                                        className="mt-2 w-full py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs rounded border border-purple-200 transition flex items-center justify-center gap-1 font-medium"
                                    >
                                        <Star size={12}/> 生成均衡排班预览
                                    </button>
                                </div>

                                {/* 最多人数模式 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">完全覆盖</span>
                                        <span className="font-bold text-gray-600">{needs.deptA.max} 人</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        覆盖率100%，建议高一{needs.deptA.gradeDistribution?.max.g1}人 + 高二{needs.deptA.gradeDistribution?.max.g2}人
                                    </div>
                                    {stats.deptA.total < needs.deptA.max ? (
                                        <p className="text-xs text-blue-600 mt-1">
                                            还需招聘 {needs.deptA.max - stats.deptA.total} 人
                                        </p>
                                    ) : (
                                        <p className="text-xs text-orange-600 mt-1">
                                            当前人数已达到或超过目标
                                        </p>
                                    )}
                                     <button
                                        onClick={() => onPreview({
                                            deptATarget: needs.deptA.max,
                                            deptBTarget: stats.deptB.total // 保持现有人数，不增加
                                        })}
                                        className="mt-2 w-full py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs rounded border border-gray-200 transition flex items-center justify-center gap-1"
                                    >
                                        <Users size={12}/> 生成完全覆盖排班预览
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 部门 B: 其他部门 */}
                    <div className="border rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                                主席/文宣/社联/体育
                            </h3>
                            <span className="text-xs px-2 py-1 bg-gray-200 rounded text-gray-600">仅室内课间操</span>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                                <span>当前可用人数 (非高三):</span>
                                <span className="font-mono font-bold text-lg">{stats.deptB.total} 人</span>
                            </div>

                            <div className="pt-2 border-t border-dashed"></div>

                            <div className="space-y-3">
                                {/* 最小需求 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最低维持人数</span>
                                        <span className="font-bold text-teal-600">{needs.deptB.min} 人</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${stats.deptB.total >= needs.deptB.min ? 'bg-green-500' : 'bg-red-500'}`}
                                            style={{width: `${Math.min(100, (stats.deptB.total / needs.deptB.min) * 100)}%`}}
                                        ></div>
                                    </div>
                                    {analysis.deptB.min > 0 ? (
                                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <TrendingUp size={12}/> 缺口: {analysis.deptB.min} 人
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <TrendingDown size={12}/> 人员充足
                                        </p>
                                    )}
                                </div>

                                {/* 最大容量 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最大容纳人数</span>
                                        <span className="font-bold text-gray-600">{needs.deptB.max} 人</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        任务量较少，不建议大规模扩招
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 招聘建议总结 */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                    <h4 className="font-bold text-blue-900 flex items-center gap-2 mb-2">
                        <UserPlus size={18}/>
                        招聘策略建议
                    </h4>
                    <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                        <li>
                            <strong>纪检/学习部 (核心部门):</strong> 
                            <span className="font-bold text-red-600 mx-1">
                                最少 {needs.deptA.min} 人 (覆盖率约60-70%)
                            </span> 
                            ~ 
                            <span className="font-bold text-purple-600 mx-1">
                                推荐 {needs.deptA.balanced} 人 (覆盖率约85-90%)
                            </span>
                            ~ 
                            <span className="font-bold text-gray-600 mx-1">
                                最多 {needs.deptA.max} 人 (覆盖率100%)
                            </span>
                            。
                        </li>
                        <li>
                            <strong>年级平衡至关重要:</strong> 由于晚自习年级避嫌规则，建议高一高二比例约为 <strong>3:2</strong>。
                            当前高一 {stats.deptA.g1} 人，高二 {stats.deptA.g2} 人。
                            {stats.deptA.g1 === 0 && <span className="text-red-600 font-bold"> ⚠️ 缺少高一学生将严重影响排班！</span>}
                        </li>
                        <li>
                            <strong>其他部门:</strong> 任务较轻，现有人员 {stats.deptB.total} 人，需求 {needs.deptB.min}~{needs.deptB.max} 人。
                            {stats.deptB.total >= needs.deptB.min ? '人员充足' : `建议补充 ${needs.deptB.min - stats.deptB.total} 人`}。
                        </li>
                    </ul>
                </div>
            </div>
        </Modal>
    );
};

export default RecruitmentAnalysisModal;
