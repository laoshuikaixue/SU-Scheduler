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
                leaders: 0 // 新增：组长计数
            },
            deptB: {
                total: 0,
                g1: 0,
                g2: 0
            }
        };

        nonG3.forEach(s => {
            // 组长单独统计，不计入普通人力池
            if (s.isLeader) {
                if (DEPT_A.includes(s.department)) {
                     count.deptA.leaders++;
                }
                // 注意：如果组长在 Dept B，这里暂时不处理，因为规则主要针对纪检/学习部
                return; 
            }

            if (DEPT_A.includes(s.department)) {
                count.deptA.total++;
                if (s.grade === 1) count.deptA.g1++;
                if (s.grade === 2) count.deptA.g2++;
            } else if (DEPT_B.includes(s.department)) {
                count.deptB.total++;
                if (s.grade === 1) count.deptB.g1++;
                if (s.grade === 2) count.deptB.g2++;
            }
        });

        return count;
    }, [students]);

    // 2. 需求计算
    const needs = useMemo(() => {
        // --- DEPT A 计算 ---
        // 任务总数 (Group A)
        const totalCleaning = TASKS_PER_GROUP.CLEANING * numGroups; 
        const totalEye = (TASKS_PER_GROUP.EYE_AM + TASKS_PER_GROUP.EYE_PM) * numGroups;
        
        // 修正：室外课间操共 3 个点位。
        // 点位1由组长负责（不计入普通人力需求）。
        // 剩余点位 = 3 - 1 = 2 个。
        const effectiveOutdoorPerGroup = Math.max(0, TASKS_PER_GROUP.OUTDOOR - 1);
        const totalOutdoor = effectiveOutdoorPerGroup * numGroups;
        const totalEvening = TASKS_PER_GROUP.EVENING * numGroups;

        // 1. 眼操合并系数：按 1:1 计算需求（用户禁止合并）。
        // 眼操总量 = 4 (早) + 6 (晚) = 10 个物理任务 = 10 个人力需求。
        
        // 2. 单组任务总量
        // 主任务: 包干(5) + 晚自习(3) = 8. (互斥)
        // 副任务: 室外(2, 扣除组长) + 眼操(10) = 12.
        // 总物理任务 = 8 + 12 = 20 个。
        
        // 3. 单组最小人数 (Min)
        // 理论上 20/2 = 10 人。
        const minPerGroup = 10;
        
        // 4. 单组最大人数 (Max)
        const maxPerGroup = 20;
        
        // 5. 单组最佳人数 (Best)
        // 理论上 10 人刚好满负荷。但为了应对避嫌规则和分配冲突，建议增加冗余。
        // 增加 1 人 (5%) 冗余 -> 11 人。
        const bestPerGroup = 11;
        
        const minDeptA = minPerGroup * numGroups;
        const bestDeptA = bestPerGroup * numGroups;
        const maxDeptA = maxPerGroup * numGroups;

        // --- DEPT B 计算 ---
        // 室内课间操: 5个点位
        const totalIndoor = TASKS_PER_GROUP.INDOOR * numGroups;
        // Min: 允许每人负责2层 -> ceil(5/2) = 3人
        const minDeptB = Math.ceil(5 / 2) * numGroups;
        // Max: 每人1层 -> 5人
        const maxDeptB = 5 * numGroups;
        
        return {
            deptA: { min: minDeptA, best: bestDeptA, max: maxDeptA },
            deptB: { min: minDeptB, max: maxDeptB }
        };
    }, [numGroups]);

    // 3. 缺口分析
    const analysis = useMemo(() => {
        return {
            deptA: {
                min: Math.max(0, needs.deptA.min - stats.deptA.total),
                best: Math.max(0, needs.deptA.best - stats.deptA.total),
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
                                {/* 最小需求 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最低维持人数 (满负荷)</span>
                                        <span className="font-bold text-indigo-600">{needs.deptA.min} 人</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${stats.deptA.total >= needs.deptA.min ? 'bg-green-500' : 'bg-red-500'}`}
                                            style={{width: `${Math.min(100, (stats.deptA.total / needs.deptA.min) * 100)}%`}}
                                        ></div>
                                    </div>
                                    {analysis.deptA.min > 0 ? (
                                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <TrendingUp size={12}/> 缺口: {analysis.deptA.min} 人 (建议招聘 {analysis.deptA.min + 2} 人以防流失)
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <TrendingDown size={12}/> 人员充足
                                        </p>
                                    )}
                                    
                                    <button
                                        onClick={() => onPreview({
                                            deptATarget: needs.deptA.min,
                                            deptBTarget: Math.max(stats.deptB.total, needs.deptB.min)
                                        })}
                                        className="mt-2 w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs rounded border border-indigo-200 transition flex items-center justify-center gap-1"
                                    >
                                        <Users size={12}/> 生成最低配置排班预览
                                    </button>
                                </div>

                                {/* 最佳均衡方案 (新增) */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最佳均衡人数 (每人2任务)</span>
                                        <span className="font-bold text-gray-800 text-lg">{needs.deptA.best} 人</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        完美分配所有任务，杜绝三任务/一任务
                                    </div>
                                    {analysis.deptA.best > 0 ? (
                                        <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                                            <TrendingUp size={12}/> 建议招聘: {analysis.deptA.best} 人
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <TrendingDown size={12}/> 人员充足
                                        </p>
                                    )}
                                    <button
                                        onClick={() => onPreview({
                                            deptATarget: needs.deptA.best,
                                            deptBTarget: Math.max(stats.deptB.total, needs.deptB.min)
                                        })}
                                        className="mt-2 w-full py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs rounded border border-purple-200 transition flex items-center justify-center gap-1 font-medium"
                                    >
                                        <Star size={12}/> 生成最佳均衡排班预览
                                    </button>
                                </div>

                                {/* 最大容量 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最大容纳人数 (轻负荷)</span>
                                        <span className="font-bold text-gray-600">{needs.deptA.max} 人</span>
                                    </div>
                                    {analysis.deptA.max > 0 && (
                                        <p className="text-xs text-blue-600 mt-1">
                                            最多还可扩招 {analysis.deptA.max} 人
                                        </p>
                                    )}
                                     <button
                                        onClick={() => onPreview({
                                            deptATarget: needs.deptA.max,
                                            deptBTarget: Math.max(stats.deptB.total, needs.deptB.max)
                                        })}
                                        className="mt-2 w-full py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs rounded border border-gray-200 transition flex items-center justify-center gap-1"
                                    >
                                        <Users size={12}/> 生成最大配置排班预览
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
                            <strong>纪检/学习部 (急需):</strong> 建议招聘 
                            <span className="font-bold text-red-600 mx-1">
                                {Math.max(0, needs.deptA.min - stats.deptA.total)} ~ {Math.max(0, needs.deptA.max - stats.deptA.total)}
                            </span> 
                            人。重点关注 <strong>高一学生</strong> (用于晚自习交叉检查和包干区)。建议高一高二比例接近 1:1，以平衡晚自习的年级避嫌需求。
                        </li>
                        <li>
                            <strong>其他部门 (饱和):</strong> 任务较轻，现有人员可能已过剩。建议维持现状或少量替补。
                        </li>
                        <li>
                            <strong>包干区说明:</strong> 已移除包干区年级限制，高一高二学生均可参与检查。
                        </li>
                    </ul>
                </div>
            </div>
        </Modal>
    );
};

export default RecruitmentAnalysisModal;
