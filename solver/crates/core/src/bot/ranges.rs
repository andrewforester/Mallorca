use super::Model;
use crate::cards::Card;
use crate::subgame::range::Range;
use crate::tree::{Node, NodeId, Street};

pub(crate) fn blueprint_update(
    model: &Model,
    range: &mut Range,
    node: NodeId,
    action: usize,
    street: Street,
    board: &[Card],
) {
    range.update(|combo| {
        let bucket = model.abstraction.bucket(street, combo, board);
        let p = model.file.probabilities(node, bucket)[action];
        f32::from(p.max(1)) / 255.0
    });
}

pub(super) fn track(
    model: &Model,
    range: &mut Range,
    node: Option<NodeId>,
    next: Option<NodeId>,
    street: Street,
    board: &[Card],
    seat: usize,
) {
    let (Some(node), Some(next)) = (node, next) else {
        return;
    };
    if !matches!(street, Street::Preflop | Street::Flop) || !model.file.includes(street) {
        return;
    }
    let Node::Decision {
        seat: node_seat,
        street: node_street,
        actions,
        ..
    } = model.file.tree.node(node)
    else {
        return;
    };
    if usize::from(*node_seat) != seat || *node_street != street {
        return;
    }
    let Some(action) = actions.iter().position(|a| a.1 == next) else {
        return;
    };
    blueprint_update(model, range, node, action, street, board);
    *range = std::mem::replace(range, Range::uniform()).or_uniform(board);
}
